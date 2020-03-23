import { createServer, Server as HttpsServer } from "https";
import { IncomingMessage, ServerResponse } from "http";
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

export type ConstructorOptions = {
  port: number;
  publicUrl: URL;
  cert: {
    key: Buffer;
    cert: Buffer;
  };
  appFolder: string;
  dbFolder: string;
};

export class Server {
  storage: BlobTree;
  wacLdp: WacLdp;
  server: HttpsServer;
  hub: Hub;
  wsServer: WebSocketServer;
  idpHandler?: (req: IncomingMessage, res: ServerResponse) => void;
  staticsHandler: (req: IncomingMessage, res: ServerResponse) => void;
  options: ConstructorOptions;
  constructor(options: ConstructorOptions) {
    this.options = options;
    this.storage = new BlobTreeInMem(); // singleton in-memory storage
    const skipWac = false;
    this.wacLdp = new WacLdp(
      this.storage,
      options.publicUrl.toString(),
      new URL(`ws://localhost:${this.options.port}/`),
      skipWac,
      `localhost:${this.options.port}`,
      false
    );
    const staticsApp = new Koa();
    staticsApp.use(koaStatic(options.appFolder, {}));
    this.staticsHandler = staticsApp.callback();

    this.server = createServer(
      options.cert,
      (req: IncomingMessage, res: ServerResponse) => {
        if (req.url.startsWith("/storage")) {
          return this.wacLdp.handler(req, res);
        }
        if (
          req.url.startsWith("/.well-known") ||
          req.url.startsWith("/certs") ||
          req.url.startsWith("/reg") ||
          req.url.startsWith("/auth") ||
          req.url.startsWith("/interaction") ||
          req.url.startsWith("/resetpassword")
        ) {
          return this.idpHandler(req, res);
        }
        return this.staticsHandler(req, res);
      }
    );
    this.wsServer = new WebSocketServer({
      server: this.server
    });
    this.hub = new Hub(this.wacLdp, this.options.publicUrl.toString());
    this.wsServer.on("connection", this.hub.handleConnection.bind(this.hub));
    this.wacLdp.on("change", (event: { url: URL }) => {
      debug("change event from this.wacLdp!", event.url);
      this.hub.publishChange(event.url);
    });
  }

  podRootFromUserName(username: string): URL {
    const sanitizedUsername = username.replace(/\W/g, "");
    return new URL(`/storage/${sanitizedUsername}/`, this.options.publicUrl);
  }
  webIdFromPodRoot(podRoot: URL): URL {
    return new URL("./profile/card#me", podRoot);
  }
  async listen(): Promise<void> {
    // const testAccount = await nodemailer.createTestAccount()
    const idpRouter = await defaultConfiguration({
      issuer: `https://localhost:${this.options.port}/`,
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
        folder: path.join(__dirname, this.options.dbFolder)
      }
    });
    const idpApp = new Koa();
    idpApp.use(idpRouter.routes());
    idpApp.use(idpRouter.allowedMethods());
    this.idpHandler = idpApp.callback();

    this.server.listen(this.options.port);
    debug("listening on port", this.options.port);
  }
  async close(): Promise<void> {
    this.server.close();
    this.wsServer.close();
    debug("closing port", this.options.port);
  }
}
