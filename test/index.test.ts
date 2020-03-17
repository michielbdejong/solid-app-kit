import { closeServer } from "../src/index";

describe("Server", () => {
  it("starts up within 1000ms", done => {
    setTimeout(() => {
      expect(closeServer()).toEqual(undefined);
      done();
    }, 1000);
    // FIXME: importing from ../src/index should not have side-effect of starting the server
    // unless ran as top-level file in the process. Then you can wait for .listen to complete,
    // and don't need the 1000ms timeout in the test which is obviously bad practice.
  });
});
