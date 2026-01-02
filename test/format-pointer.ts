import { formatPointer } from "../lib/index.ts";
import nodeAssert from "node:assert";

describe("formatPointer", () => {
  it("should format a valid pointer address", () => {
    const pointerAddress = BigInt(42);
    const formatted = formatPointer({ pointerAddress });
    nodeAssert.strictEqual(formatted, "0x000000000000002A");
  });

  describe("invalid pointer addresses", () => {
    it("should throw for negative pointer address", () => {
      const pointerAddress = BigInt(-1);
      nodeAssert.throws(
        () => formatPointer({ pointerAddress }),
        (ex: Error) => {

          return ex.message === "invalid pointer address" &&
            (ex.cause as Error).message === "pointer address cannot be negative";
        }
      );
    });

    it("should throw for pointer address exceeding 64-bit range", () => {
      const pointerAddress = BigInt("0x1FFFFFFFFFFFFFFFF");
      nodeAssert.throws(
        () => formatPointer({ pointerAddress }),
        (ex: Error) => {

          return ex.message === "invalid pointer address" &&
            (ex.cause as Error).message === "pointer address exceeds 64-bit range";
        }
      );
    });
  });
});
