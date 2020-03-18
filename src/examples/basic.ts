import { Server } from "..";
import Debug from "debug";

const debug = Debug("basic example");

// on startup:
const port = parseInt(process.env.PORT ? process.env.PORT : "", 10) || 8080;

const aud = process.env.AUD || "https://localhost:8443";
const server = new Server(
  port,
  aud,
  process.env.SKIP_WAC
    ? undefined
    : new URL("https://alice.idp.test.solidproject.org/profile/card#me"),
  "."
);
debug("listening...");
server.listen().catch(console.error.bind(console));
// setTimeout(() => {
//   debug("closing server");
//   server.close();
// }, 60000);

// import Koa from "koa";
// import koaStatic from "koa-static";
// import { createServer } from "http";
// const app = new Koa();
// app.use(koaStatic(".", {}));
// const callback = app.callback();
// createServer(callback).listen(8080);
