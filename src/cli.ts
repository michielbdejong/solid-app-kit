#!/usr/bin/env node

import { Server, ConstructorOptions } from ".";
import { readFileSync } from "fs";
import Debug from "debug";

const debug = Debug("Solid App Kit");

const appFolder = process.argv[2];

function getInt(str: string): number | undefined {
  const candidate: number = parseInt(str);
  if (isNaN(candidate)) {
    return undefined;
  }
  return candidate;
}

// on startup:
const config: ConstructorOptions = {
  https: !!process.env.HTTPS,
  portListen: getInt(process.env.PORT),
  domain: process.env.DOMAIN || "localhost",
  publicPortSuffix: process.env.PUBLIC_PORT_SUFFIX || "",
  publicProtocolSuffix: process.env.PUBLIC_PROTOCOL_SUFFIX || "",
  cert: undefined,
  appFolder, // statics path (your app goes here!)
  dbFolder: "../.db", // NSS-compatible user database
  redisUrl: process.env.REDIS_URL
};

if (config.https) {
  console.log(`Running with https`);
  try {
    config.cert = {
      key: readFileSync("server.key"),
      cert: readFileSync("server.cert")
    };
  } catch (e) {
    throw new Error("Could not load ./server.key and ./server.cert");
  }
} else {
  console.log(`Not running with https`);
}

debug("Starting", config);
const server = new Server(config);
debug("listening...");
server.listen().catch(console.error.bind(console));
