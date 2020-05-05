#!/usr/bin/env node

import { Server, ConstructorOptions } from ".";
import { readFileSync } from "fs";
import Debug from "debug";

const debug = Debug("Solid App Kit");

const appFolder = process.argv[2];

// on startup:
const config: ConstructorOptions = {
  httpsDomain: undefined,
  port: 8000,
  https: false,
  cert: {
    key: readFileSync("server.key"),
    cert: readFileSync("server.cert")
  },
  appFolder, // statics path (your app goes here!)
  dbFolder: "../.db", // NSS-compatible user database
  redisUrl: process.env.REDIS_URL
};
if (process.env.HTTPS_DOMAIN) {
  console.log(
    `Serving app from ${appFolder} on https://${process.env.HTTPS_DOMAIN}/`
  );
  config.port = 443;
  config.https = true;
  config.httpsDomain = process.env.HTTPS_DOMAIN;
}
if (process.env.PORT) {
  console.log(`Serving app from ${appFolder} on port ${process.env.PORT}`);
  config.port = parseInt(process.env.PORT);
}
const server = new Server(config);
debug("listening...");
server.listen().catch(console.error.bind(console));
