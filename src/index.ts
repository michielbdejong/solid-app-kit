import {
  createServer,
  IncomingMessage,
  ServerResponse,
  Server as HttpServer
} from "http";
import Debug from "debug";
import { BlobTreeInMem, BlobTree, WacLdp } from "wac-ldp";
import { Server as WebSocketServer } from "ws";
import { Hub } from "./hub";

import Koa from "koa";
import koaStatic from "koa-static";
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
  wsServer: WebSocketServer;
  idpHandler?: (req: IncomingMessage, res: ServerResponse) => void;
  staticsHandler: (req: IncomingMessage, res: ServerResponse) => void;
  publicUrl: URL;
  constructor(port: number, publicUrl: URL, staticsPath: string) {
    this.port = port;
    this.publicUrl = publicUrl;
    this.storage = new BlobTreeInMem(); // singleton in-memory storage
    const skipWac = false;
    this.wacLdp = new WacLdp(
      this.storage,
      publicUrl.toString(),
      new URL(`ws://localhost:${this.port}/`),
      skipWac,
      `localhost:${this.port}`,
      false
    );
    const staticsApp = new Koa();
    staticsApp.use(koaStatic(staticsPath, {}));
    this.staticsHandler = staticsApp.callback();

    this.server = createServer((req: IncomingMessage, res: ServerResponse) => {
      if (req.url.startsWith("/storage")) {
        return this.wacLdp.handler(req, res);
      }
      if (
        req.url.startsWith("/.well-known") ||
        req.url.startsWith("/interaction") ||
        req.url.startsWith("/resetpassword")
      ) {
        return this.idpHandler(req, res);
      }
      return this.staticsHandler(req, res);
    });
    this.wsServer = new WebSocketServer({
      server: this.server
    });
    this.hub = new Hub(this.wacLdp, publicUrl.toString());
    this.wsServer.on("connection", this.hub.handleConnection.bind(this.hub));
    this.wacLdp.on("change", (event: { url: URL }) => {
      debug("change event from this.wacLdp!", event.url);
      this.hub.publishChange(event.url);
    });
  }

  podRootFromUserName(username: string): URL {
    const sanitizedUsername = username.replace(/\W/g, "");
    return new URL(`/storage/${sanitizedUsername}/`, this.publicUrl);
  }
  webIdFromPodRoot(podRoot: URL): URL {
    return new URL("./profile/card#me", podRoot);
  }
  async listen(): Promise<void> {
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
      webIdFromUsername: async (username: string): Promise<string> => {
        return this.webIdFromPodRoot(
          this.podRootFromUserName(username)
        ).toString();
      },
      onNewUser: async (username: string): Promise<string> => {
        const podRoot = this.podRootFromUserName(username);
        const webId = this.webIdFromPodRoot(podRoot);
        await this.wacLdp.setRootAcl(podRoot, webId);

        // Make profile folder world-readable
        // make sure this.webIdFromPodRoot(podRoot) falls in here
        await this.wacLdp.setPublicAcl(
          new URL("./profile/", podRoot),
          webId,
          "Read"
        );

        // Make public folder world-readable
        await this.wacLdp.setPublicAcl(
          new URL("./public/", podRoot),
          webId,
          "Read"
        );

        // Make global inbox world-appendable
        await this.wacLdp.setPublicAcl(
          new URL("./inbox/", podRoot),
          webId,
          "Append"
        );

        return webId.toString();
      },
      storagePreset: "filesystem",
      storageData: {
        redisUrl: process.env.REDIS_URL || "",
        folder: path.join(__dirname, "./.db")
      }
    });
    const idpApp = new Koa();
    idpApp.use(idpRouter.routes());
    idpApp.use(idpRouter.allowedMethods());
    this.idpHandler = idpApp.callback();

    this.server.listen(this.port);
    debug("listening on port", this.port);
  }
  async close(): Promise<void> {
    this.server.close();
    this.wsServer.close();
    debug("closing port", this.port);
  }
}
