import {
  createServer as createServerHttps,
  Server as HttpsServer
} from "https";
import { createServer as createServerHttp, Server as HttpServer } from "http";
import { IncomingMessage, ServerResponse } from "http";
import Debug from "debug";
import { BlobTree, WacLdp } from "wac-ldp";
import { Server as WebSocketServer } from "ws";
import { BlobTreeRedis } from "./BlobTreeRedis";
import { Hub } from "./hub";
import koaSend from "koa-send";
import Koa from "koa";
import koaStatic from "koa-static";
// import nodemailer from "nodemailer";
import { defaultConfiguration } from "solid-idp";
import { keystore } from "./keystore";
import path from "path";

const debug = Debug("server");

export type ConstructorOptions = {
  https: boolean;
  portListen: number;
  publicPortSuffix: string;
  publicProtocolSuffix: string;
  domain: string;
  cert: {
    key: Buffer;
    cert: Buffer;
  };
  appFolder: string;
  dbFolder: string;
  redisUrl?: string;
};

export class Server {
  storage: BlobTree;
  wacLdp: WacLdp;
  server: HttpsServer | HttpServer;
  hub: Hub;
  wsServer: WebSocketServer;
  idpHandler?: (req: IncomingMessage, res: ServerResponse) => void;
  staticsHandler: (req: IncomingMessage, res: ServerResponse) => void;
  options: ConstructorOptions;
  host: string;
  constructor(options: ConstructorOptions) {
    this.options = options;
    this.storage = new BlobTreeRedis(options.redisUrl); // singleton in-memory storage
    this.host = `http${options.publicProtocolSuffix}://${options.domain}${options.publicPortSuffix}`;
    const webSocketUrl = new URL(
      `ws${options.publicProtocolSuffix}://${options.domain}${options.publicPortSuffix}/`
    );
    const skipWac = false;
    this.wacLdp = new WacLdp(
      this.storage,
      `${this.host}/`,
      webSocketUrl,
      skipWac,
      this.host,
      true
    );
    const staticsApp = new Koa();
    staticsApp.use(koaStatic(options.appFolder, {}));
    staticsApp.use(async ctx => {
      if (ctx.status === 404) {
        await koaSend(ctx, "index.html", { root: options.appFolder });
      }
    });
    this.staticsHandler = staticsApp.callback();
    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
    const handler = (req: IncomingMessage, res: ServerResponse) => {
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
    };
    if (options.https) {
      this.server = createServerHttps(options.cert, handler);
    } else {
      this.server = createServerHttp(handler);
    }

    this.wsServer = new WebSocketServer({
      server: this.server
    });
    this.hub = new Hub(this.wacLdp, `${this.host}/`);
    this.wsServer.on("connection", this.hub.handleConnection.bind(this.hub));
    this.wacLdp.on("change", (event: { url: URL }) => {
      debug("change event from this.wacLdp!", event.url);
      this.hub.publishChange(event.url);
    });
  }

  podRootFromUserName(username: string): URL {
    const sanitizedUsername = username.replace(/\W/g, "");
    return new URL(`/storage/${sanitizedUsername}/`, this.host);
  }
  webIdFromPodRoot(podRoot: URL): URL {
    return new URL("./profile/card#me", podRoot);
  }
  async listen(): Promise<void> {
    // const testAccount = await nodemailer.createTestAccount()
    const idpRouter = await defaultConfiguration({
      issuer: this.host,
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

        // Create profile document at
        // this.webIdFromPodRoot(podRoot)
        await this.wacLdp.createLocalDocument(
          this.webIdFromPodRoot(podRoot),
          "text/turtle",
          `
@prefix schema: <http://schema.org/>.
@prefix pim: <http://www.w3.org/ns/pim/space#>.
@prefix ldp: <http://www.w3.org/ns/ldp#>.
@prefix acl: <http://www.w3.org/ns/auth/acl#>.
<#me>
  a schema:Person;
  pim:storage <${podRoot}>;
  ldp:inbox <${podRoot}inbox/>;
  acl:trustedApp <#same-origin>.
<#same-origin>
  acl:origin <${this.host}>;
  acl:mode acl:Read, acl:Write, acl:Control.
`
        );

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
      storagePreset: "redis", // or "filesystem",
      storageData: {
        redisUrl: this.options.redisUrl, // used if storagePreset is "redis"
        folder: path.join(__dirname, this.options.dbFolder) // used if storagePreset is "filesystem"
      }
    });
    const idpApp = new Koa();
    idpApp.use(idpRouter.routes());
    idpApp.use(idpRouter.allowedMethods());
    this.idpHandler = idpApp.callback();

    this.server.listen(this.options.portListen);
    debug("listening on port", this.options.portListen);
  }
  async close(): Promise<void> {
    this.server.close();
    this.wsServer.close();
    debug("closing port", this.options.portListen);
  }
}
