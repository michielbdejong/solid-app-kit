#!/usr/bin/env node

import { Server } from ".";
import Debug from "debug";

const debug = Debug("Solid App Kit");

const appFolder = process.argv[2];
console.log("Serving app from ", appFolder);

// on startup:
const server = new Server(
  8080, // port
  new URL("http://localhost:8080"), // audience for WebId-OIDC bearer tokens
  appFolder, // statics path (your app goes here!)
  "../.db" // NSS-compatible user database
);
debug("listening...");
server.listen().catch(console.error.bind(console));
