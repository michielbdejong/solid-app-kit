import { Server } from "..";
import Debug from "debug";

const debug = Debug("basic example");

// on startup:
const server = new Server(
  8080, // port
  new URL("http://localhost:8080"), // audience for WebId-OIDC bearer tokens
  "./public", // statics path (your app goes here!)
  "../.db" // NSS-compatible user database
);
debug("listening...");
server.listen().catch(console.error.bind(console));
