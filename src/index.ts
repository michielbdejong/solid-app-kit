import {
  createServer,
  IncomingMessage,
  ServerResponse,
  Server as HttpServer
} from "http";
import Debug from "debug";
import { BlobTreeInMem, BlobTree, WacLdp } from "wac-ldp";
import * as WebSocket from "ws";
import { Hub } from "./hub";

import Koa from "koa";
// import nodemailer from "nodemailer";
import { defaultConfiguration } from "solid-idp";
import { keystore } from "./keystore";
import path from "path";

const debug = Debug("server");

export class Server {
  storage: BlobTree;
  wacLdp: WacLdp;
  server: HttpServer;
  hub: Hub;
  port: number;
  wsServer: any;
  owner: URL | undefined;
  idpHandler?: (req: IncomingMessage, res: ServerResponse) => void;
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

    this.server = createServer((req: IncomingMessage, res: ServerResponse) => {
      if (req.url.startsWith("/storage")) {
        return this.wacLdp.handler(req, res);
      }
      if (req.url.startsWith("/idp")) {
        return this.idpHandler(req, res);
      }
      res.end("statics!");
    });
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
    // const testAccount = await nodemailer.createTestAccount()
    const idpRouter = await defaultConfiguration({
      issuer: "http://localhost:3000/",
      pathPrefix: "",
      keystore,
      mailConfiguration:
        process.env.EMAIL_USER && process.env.EMAIL_PASS
          ? {
              service: "gmail",
              auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS
              }
            }
          : undefined,
      webIdFromUsername: async (username: string) => {
        return `https://${username}.api.swype.io/profile/card#me`;
      },
      onNewUser: async (username: string) => {
        return `https://${username}.api.swype.io/profile/card#me`;
      },
      storagePreset: "filesystem",
      storageData: {
        redisUrl: process.env.REDIS_URL || "",
        folder: path.join(__dirname, "./.db")
      }
    });
    const app = new Koa();
    app.use(idpRouter.routes());
    app.use(idpRouter.allowedMethods());
    this.idpHandler = app.callback();

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
