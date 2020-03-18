import { Server } from "../src/index";

describe("Server", () => {
  it("starts and stops", async () => {
    const port = parseInt(process.env.PORT ? process.env.PORT : "", 10) || 8080;

    const aud = process.env.AUD || "https://localhost:8443";
    const server = new Server(port, new URL(aud), "./public", "./.db");
    await server.listen();
    await server.close();
  });
});
