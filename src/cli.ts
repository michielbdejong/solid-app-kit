#!/usr/bin/env node

import { Server } from ".";
import { readFileSync } from "fs";
import Debug from "debug";

const debug = Debug("Solid App Kit");

const appFolder = process.argv[2];
console.log(`Serving app from ${appFolder} on https://lolcathost.de/`);

// on startup:
const server = new Server({
  port: 443,
  publicUrl: new URL("https://lolcathost.de/"), // audience for WebId-OIDC bearer tokens
  cert: {
    key: readFileSync("server.key"),
    cert: readFileSync("server.cert")
  },
  appFolder, // statics path (your app goes here!)
  dbFolder: "../.db" // NSS-compatible user database
});
debug("listening...");
server.listen().catch(console.error.bind(console));
