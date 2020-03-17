import * as http from "http";
import Debug from "debug";
import { BlobTreeInMem, BlobTree, WacLdp } from "wac-ldp";
import * as WebSocket from "ws";
import { Hub } from "./hub";

const debug = Debug("server");

export class Server {
  storage: BlobTree;
  wacLdp: WacLdp;
  server: http.Server;
  hub: Hub;
  port: number;
  wsServer: any;
  owner: URL | undefined;
  constructor(port: number, aud: string, owner: URL | undefined) {
    this.port = port;
    this.storage = new BlobTreeInMem(); // singleton in-memory storage
    const skipWac = owner === undefined;
    this.wacLdp = new WacLdp(
      this.storage,
      aud,
      new URL(`ws://localhost:${this.port}/`),
      skipWac,
      `localhost:${this.port}`,
      false
    );
    this.server = http.createServer(this.wacLdp.handler.bind(this.wacLdp));
    this.wsServer = new WebSocket.Server({
      server: this.server
    });
    this.hub = new Hub(this.wacLdp, aud);
    this.owner = owner;
    this.wsServer.on("connection", this.hub.handleConnection.bind(this.hub));
    this.wacLdp.on("change", (event: { url: URL }) => {
      debug("change event from this.wacLdp!", event.url);
      this.hub.publishChange(event.url);
    });
  }
  async listen() {
    if (this.owner) {
      // FIXME: don't hard-code "http://server" here; use the `aud: string` arg from the constructor, maybe?
      await this.wacLdp.setRootAcl(
        new URL(`http://server:${this.port}/`),
        this.owner
      );
      await this.wacLdp.setPublicAcl(
        new URL(`http://server:${this.port}/public/`),
        this.owner,
        "Read"
      );
    }
    this.server.listen(this.port);
    debug("listening on port", this.port);
  }
  close() {
    this.server.close();
    this.wsServer.close();
    debug("closing port", this.port);
  }
}

// on startup:
const port = parseInt(process.env.PORT ? process.env.PORT : "", 10) || 8080;

const aud = process.env.AUD || "https://localhost:8443";
const server = new Server(
  port,
  aud,
  process.env.SKIP_WAC
    ? undefined
    : new URL("https://alice.idp.test.solidproject.org/profile/card#me")
);
server.listen().catch(console.error.bind(console));
// server.close()

export function closeServer() {
  debug("closing server");
  server.close();
}
