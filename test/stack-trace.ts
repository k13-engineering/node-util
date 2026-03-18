import nodeAssert from "node:assert";
import { createStackTrace } from "../lib/snippets/stack-trace.ts";

describe("createStackTrace", () => {
  it("should return a string", () => {
    const stackTrace = createStackTrace({ up: 0 });
    nodeAssert.strictEqual(typeof stackTrace, "string");
  });

  it("should contain the current test file", () => {
    const stackTrace = createStackTrace({ up: 0 });
    nodeAssert.ok(stackTrace.includes("stack-trace"), `expected stack trace to reference test file, got:\n${stackTrace}`);
  });

  it("should remove frames when using up parameter", () => {
    const wrapper = () => createStackTrace({ up: 0 });

    const directTrace = createStackTrace({ up: 0 });
    const wrappedTrace = wrapper();

    const directLineCount = directTrace.split("\n").length;
    const wrappedLineCount = wrappedTrace.split("\n").length;

    nodeAssert.strictEqual(wrappedLineCount, directLineCount + 1);
  });

  it("should skip the specified number of frames with up", () => {
    const inner = () => createStackTrace({ up: 1 });
    const outer = () => inner();

    const traceFromOuter = outer();
    nodeAssert.ok(!traceFromOuter.includes("at inner"), `expected 'inner' frame to be skipped, got:\n${traceFromOuter}`);
    nodeAssert.ok(traceFromOuter.includes("at outer"), `expected 'outer' frame to be present, got:\n${traceFromOuter}`);
  });

  it("should return fewer lines with higher up values", () => {
    const stackTrace0 = createStackTrace({ up: 0 });
    const stackTrace1 = createStackTrace({ up: 1 });
    const stackTrace2 = createStackTrace({ up: 2 });

    const lines0 = stackTrace0.split("\n").length;
    const lines1 = stackTrace1.split("\n").length;
    const lines2 = stackTrace2.split("\n").length;

    nodeAssert.ok(lines0 > lines1, `expected up:0 (${lines0} lines) to have more lines than up:1 (${lines1} lines)`);
    nodeAssert.ok(lines1 > lines2, `expected up:1 (${lines1} lines) to have more lines than up:2 (${lines2} lines)`);
  });
});
