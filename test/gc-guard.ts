import assert from "node:assert";
// @ts-expect-error missing types
import gc from "expose-gc";
import { createGarbageCollectionGuard, createDefaultGarbageCollectedWithoutReleaseError } from "../lib/snippets/gc-guard.ts";

const captureUncaughtExceptionsDuring = async (fn: (args: { uncaughtExceptions: () => Error[] }) => Promise<void>): Promise<Error[]> => {

  let uncaughtExceptions: Error[] = [];

  const uncaughtExceptionListener = (ex: Error) => {
    uncaughtExceptions = [
      ...uncaughtExceptions,
      ex
    ];
  };

  const previousListeners = process.listeners("uncaughtException");
  previousListeners.forEach((listener) => {
    process.off("uncaughtException", listener);
  });

  process.on("uncaughtException", uncaughtExceptionListener);

  try {
    await fn({
      uncaughtExceptions: () => {
        return uncaughtExceptions;
      }
    });
  } finally {
    process.off("uncaughtException", uncaughtExceptionListener);
    previousListeners.forEach((listener) => {
      process.on("uncaughtException", listener);
    });
  }

  return uncaughtExceptions;
};

describe("memory leak detection", () => {
  it("should throw exception when buffer is garbage collected without unmap", async function () {
    this.timeout(5000);

    const errorInstance = Error("test error");
    let createErrorCalls: { info: unknown }[] = [];

    const gcGuard = createGarbageCollectionGuard({
      createError: ({ info }) => {
        createErrorCalls = [
          ...createErrorCalls,
          { info }
        ];
        return errorInstance;
      }
    });

    const myInfo = {};

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    let handle = gcGuard.protect({
      release: () => {
      },

      info: myInfo
    }) as (ReturnType<typeof gcGuard.protect> | undefined);

    const capturedUncaughtExceptions = await captureUncaughtExceptionsDuring(async ({ uncaughtExceptions }) => {
      // remove reference to allow garbage collection
      handle = undefined;

      const startedAt = performance.now();

      while (performance.now() - startedAt < 3000) {
        gc();
        await new Promise((resolve) => setTimeout(resolve, 20));

        const exceptions = uncaughtExceptions();
        if (exceptions.length > 0) {
          return;
        }
      }
    });

    assert.strictEqual(capturedUncaughtExceptions.length, 1);

    const ex = capturedUncaughtExceptions[0];
    assert.strictEqual(ex, errorInstance);
    assert.strictEqual(createErrorCalls.length, 1);
    assert.strictEqual(createErrorCalls[0].info, myInfo);
  });

  it("should not throw exception when release is called before garbage collection", async function () {
    this.timeout(5000);

    const errorInstance = Error("test error");
    let createErrorCalls: { info: unknown }[] = [];

    const gcGuard = createGarbageCollectionGuard({
      createError: ({ info }) => {
        createErrorCalls = [
          ...createErrorCalls,
          { info }
        ];
        return errorInstance;
      }
    });

    const myInfo = {};
    let releaseCallCount = 0;

    let handle = gcGuard.protect({
      release: () => {
        releaseCallCount += 1;
      },

      info: myInfo
    }) as (ReturnType<typeof gcGuard.protect> | undefined);

    // Call release before garbage collection
    handle!.release();

    const capturedUncaughtExceptions = await captureUncaughtExceptionsDuring(async ({ uncaughtExceptions }) => {
      // remove reference to allow garbage collection
      handle = undefined;

      const startedAt = performance.now();

      while (performance.now() - startedAt < 1000) {
        gc();
        await new Promise((resolve) => setTimeout(resolve, 20));

        const exceptions = uncaughtExceptions();
        if (exceptions.length > 0) {
          return;
        }
      }
    });

    // No exceptions should be thrown since release was called
    assert.strictEqual(capturedUncaughtExceptions.length, 0);
    assert.strictEqual(createErrorCalls.length, 0);
    assert.strictEqual(releaseCallCount, 1);
  });
});

describe("createDefaultGarbageCollectedWithoutReleaseError", () => {
  it("should create a properly formatted error message", () => {
    const error = createDefaultGarbageCollectedWithoutReleaseError({
      name: "TestMemoryLeakError",
      info: "TestResource #123",
      releaseFunctionName: "dispose",
      resourcesName: "TestResources",
    });

    assert.strictEqual(error.name, "TestMemoryLeakError");
    assert.ok(error.message.includes("TestResource #123 was garbage collected without calling release()"));
    assert.ok(error.message.includes("This would cause a memory leak"));
    assert.ok(error.message.includes("dispose() on all TestResources"));
    assert.ok(error.message.includes("Underlying resources should have still be cleaned up"));
  });

  it("should create error with different parameters", () => {
    const error = createDefaultGarbageCollectedWithoutReleaseError({
      name: "BufferLeakError",
      info: "Buffer instance at 0x12345",
      releaseFunctionName: "unmap",
      resourcesName: "buffers",
    });

    assert.strictEqual(error.name, "BufferLeakError");
    assert.ok(error.message.includes("Buffer instance at 0x12345"));
    assert.ok(error.message.includes("unmap()"));
    assert.ok(error.message.includes("buffers"));
  });
});
