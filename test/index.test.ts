import { HelloWorld } from "../src/index";

describe("HelloWorld", () => {
  it("returns hello world", () => {
    expect(HelloWorld()).toEqual("hello, world");
  });
});
