import { Server } from "../src/index";

describe("Server", () => {
  it("starts and stops", async () => {
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
    await server.listen();
    await server.close();
  });
});
