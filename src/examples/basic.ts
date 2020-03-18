import { Server } from "..";
import Debug from "debug";

const debug = Debug("basic example");

// on startup:
const server = new Server(
  8080, // port
  "http://localhost:8080", // audience for WebId-OIDC bearer tokens
  new URL("http://localhost:8080/interaction/alice"), // pod owner identity
  "." // statics path (your app goes here!)
);
debug("listening...");
server.listen().catch(console.error.bind(console));
