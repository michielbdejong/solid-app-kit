import { RedisClient, createClient, Multi } from "redis";
import { BlobTree, Path } from "wac-ldp";
import { Blob } from "wac-ldp/src/lib/storage/Blob";
import { Container, Member } from "wac-ldp/src/lib/storage/Container";
import { EventEmitter } from "events";
import { promisify } from "util";
import { streamToBuffer, bufferToStream } from "./streams";
import Debug from "debug";

const debug = Debug("BlobTreeRedis");

type PromisifiedRedisClient = {
  select: (dbIndex: number) => Promise<void>;
  flushdb: () => Promise<void>;
  quit: () => Promise<void>;
  watch: (key: string) => Promise<void>;
  exists: (key: string) => Promise<number>;
  get: (key: string) => Promise<string>;
  set: (key: string, value: string) => Promise<string>;
  hset: (key: string, field: string, value: string) => Promise<string>;
  hgetall: (key: string) => Promise<{ [field: string]: string }>;
  del: (key: string) => Promise<void>;
  hdel: (key: string, field: string) => Promise<string>;
  multi: () => PromisifiedRedisMulti;
};

type PromisifiedRedisMulti = {
  select: () => Promise<void>;
  flushdb: () => Promise<void>;
  quit: () => Promise<void>;
  watch: (key: string) => Promise<void>;
  exists: (key: string) => Promise<number>;
  get: (key: string) => Promise<string>;
  set: (key: string, value: string) => Promise<string>;
  hset: (key: string, field: string, value: string) => Promise<string>;
  hgetall: (key: string) => Promise<{ [field: string]: string }>;
  del: (key: string) => Promise<void>;
  hdel: (key: string, field: string) => Promise<string>;
  exec: () => Promise<void>;
};

class BlobRedis implements Blob {
  path: Path;
  client: PromisifiedRedisClient;
  watched: boolean;
  constructor(path: Path, client: PromisifiedRedisClient) {
    this.path = path;
    this.client = client;
    this.watched = false;
  }
  async checkWatch(): Promise<void> {
    if (this.watched) {
      return;
    }
    await this.client.watch(this.path.toString());
    this.watched = true;
  }
  async exists(): Promise<boolean> {
    await this.checkWatch();
    const ret = await this.client.exists(this.path.toString());
    return ret === 1;
  }
  async getData(): Promise<ReadableStream | undefined> {
    await this.checkWatch();
    const ret = await this.client.get(this.path.toString());
    if (ret) {
      return bufferToStream(Buffer.from(ret));
    }
  }
  async setData(stream: ReadableStream): Promise<void> {
    await this.checkWatch(); // to support optimistic locking for setData-then-delete
    const value: Buffer = await streamToBuffer(stream);

    // this.client.set(this.path.toString(), value.toString())

    const multi: PromisifiedRedisMulti = this.client.multi();
    // method calls on the multi object are synchronous
    // except for multi.exec, which is asynchronous again.
    multi.set(this.path.toString(), value.toString());
    // mkdir -p:
    let childPath = this.path;
    let parentPath;
    let isContainer = "false";
    do {
      parentPath = childPath.toParent();
      multi.hset(parentPath.toString(), childPath.toString(), isContainer);
      isContainer = "true";
      childPath = parentPath;
    } while (!parentPath.isRoot());
    // This watch..multi..exec transaction guarantees two things:
    // 1) the blob wasn't deleted by a different thread inbetween our
    // `set` call for the blob and our `hset` call for the container.
    // 2) the contents of the blob didn't change in between any previous
    // `getData` or `exists` calls on this blob, and our execution of
    // `setData` here.
    // See https://redis.io/topics/transactions for more details,
    // specifically the 'Optimistic locking using check-and-set' section.
    await multi.exec();
  }
  async delete(): Promise<void> {
    await this.checkWatch(); // to support optimistic locking for delete-then-setData
    const multi = this.client.multi();
    // method calls on the multi object are synchronous
    // except for multi.exec, which is asynchronous again.
    multi.del(this.path.toString());
    const parentPath = this.path.toParent().toString();
    multi.hdel(parentPath, this.path.toString());
    // See https://redis.io/topics/transactions for more details,
    // specifically the 'Optimistic locking using check-and-set' section.
    await multi.exec();
  }
}

class ContainerRedis implements Container {
  path: Path;
  client: PromisifiedRedisClient;
  constructor(path: Path, client: PromisifiedRedisClient) {
    this.path = path;
    this.client = client;
  }
  async exists(): Promise<boolean> {
    const ret = await this.client.exists(this.path.toString());
    return ret === 1;
  }
  async getMembers(): Promise<Member[]> {
    const membersObj: { [field: string]: string } = await this.client.hgetall(
      this.path.toString()
    );
    const prefixLength = this.path.toString().length;
    const members = [];
    for (const absPath in membersObj) {
      const relPath = absPath.substring(prefixLength);
      members.push({
        name: relPath,
        isContainer: membersObj[absPath] === "true"
      } as Member);
    }
    return members;
  }
  async delete(): Promise<void> {
    await this.client.del(this.path.toString());
  }
}

function promisifyRedisMulti(callbacksClient: Multi): PromisifiedRedisMulti {
  return {
    select: callbacksClient.select.bind(callbacksClient),
    flushdb: callbacksClient.flushdb.bind(callbacksClient),
    get: promisify(callbacksClient.get).bind(callbacksClient),
    set: promisify(callbacksClient.set).bind(callbacksClient),
    del: (promisify(callbacksClient.DEL).bind(callbacksClient) as unknown) as (
      path: string
    ) => Promise<void>,
    exists: promisify(callbacksClient.exists).bind(callbacksClient),
    hgetall: promisify(callbacksClient.hgetall).bind(callbacksClient),
    hset: promisify(callbacksClient.hset).bind(callbacksClient),
    hdel: promisify(callbacksClient.hdel).bind(callbacksClient),
    quit: promisify(callbacksClient.quit).bind(callbacksClient),
    watch: promisify(callbacksClient.watch).bind(callbacksClient),
    exec: promisify(callbacksClient.exec).bind(callbacksClient)
  };
}
function promisifyRedisClient(
  callbacksClient: RedisClient
): PromisifiedRedisClient {
  return {
    select: callbacksClient.select.bind(callbacksClient),
    flushdb: callbacksClient.flushdb.bind(callbacksClient),
    get: promisify(callbacksClient.get).bind(callbacksClient),
    set: promisify(callbacksClient.set).bind(callbacksClient),
    del: (promisify(callbacksClient.DEL).bind(callbacksClient) as unknown) as (
      path: string
    ) => Promise<void>,
    exists: promisify(callbacksClient.exists).bind(callbacksClient),
    hgetall: promisify(callbacksClient.hgetall).bind(callbacksClient),
    hset: promisify(callbacksClient.hset).bind(callbacksClient),
    hdel: promisify(callbacksClient.hdel).bind(callbacksClient),
    quit: promisify(callbacksClient.quit).bind(callbacksClient),
    watch: promisify(callbacksClient.watch).bind(callbacksClient),
    multi: (): PromisifiedRedisMulti => {
      const multi = callbacksClient.multi();
      return promisifyRedisMulti(multi);
    }
  };
}
export class BlobTreeRedis extends EventEmitter implements BlobTree {
  callbacksClient: RedisClient;
  client: PromisifiedRedisClient;
  constructor(redisUrl?: string) {
    super();
    debug("Creating redis client", redisUrl);
    this.callbacksClient = createClient(redisUrl);
    this.client = promisifyRedisClient(this.callbacksClient);
  }
  select(dbIndex: number): Promise<void> {
    return this.client.select(dbIndex);
  }
  flushdb(): Promise<void> {
    return this.client.flushdb();
  }
  stop(): Promise<void> {
    return this.client.quit();
  }
  getBlob(path: Path): Blob {
    const ret: Blob = new BlobRedis(path, this.client);
    return ret;
  }
  getContainer(path: Path): Container {
    const ret: Container = new ContainerRedis(path, this.client);
    return ret;
  }
}
