import nodeAssert from "node:assert";

// Import the function we're testing
// We need to import from the lib directory
import { createDefaultNativeAddonLoader, createNativeAddonLoader } from "../lib/index.ts";

// Mock filesystem interface
type MockFileSystemState = {
  files: Set<string>;
  directories: Set<string>;
};

// Get parent directory path from a given path
const getParentDir = (path: string): string => {
  const parts = path.split("/");
  return parts.slice(0, -1).join("/") || "/";
};

// Get child file entries for a given path
const getFileEntries = (filePaths: Set<string>, parentPath: string): string[] => {
  const entries: string[] = [];
  for (const filePath of filePaths) {
    const dir = getParentDir(filePath) || "/";
    if (dir === parentPath) {
      const parts = filePath.split("/");
      entries.push(parts[parts.length - 1]);
    }
  }
  return entries;
};

// Get child directory entries for a given path
const getDirEntries = (
  dirPaths: Set<string>,
  parentPath: string
): string[] => {
  const entries: string[] = [];
  for (const dirPath of dirPaths) {
    if (dirPath === parentPath) {
      continue;
    }
    if (getParentDir(dirPath) === parentPath) {
      const parts = dirPath.split("/");
      entries.push(parts[parts.length - 1]);
    }
  }
  return entries;
};

// Helper to create a mock filesystem
const createMockFileSystem = (state: MockFileSystemState) => {
  return {
    existsSync: (path: string): boolean => {
      return state.files.has(path) || state.directories.has(path);
    },
    readdirSync: (path: string): string[] => {
      const fileEntries = getFileEntries(state.files, path);
      const dirEntries = getDirEntries(state.directories, path);
      const entries = [...fileEntries, ...dirEntries];

      if (!state.directories.has(path) && !state.files.has(path)) {
        throw new Error(
          `ENOENT: no such file or directory, scandir '${path}'`
        );
      }

      return entries;
    },
  };
};

// Helper to create test scenario with filesystem setup
const createTestScenario = () => {
  const mockState: MockFileSystemState = {
    files: new Set(),
    directories: new Set(),
  };

  const addFile = (path: string) => {
    mockState.files.add(path);
    // Ensure all parent directories exist
    let current = path;
    while (current !== "/" && current !== "") {
      current = current.split("/").slice(0, -1).join("/");
      if (current) {
        mockState.directories.add(current);
      }
    }
  };

  const addDirectory = (path: string) => {
    mockState.directories.add(path);
    // Ensure all parent directories exist
    let current = path;
    while (current !== "/" && current !== "") {
      current = current.split("/").slice(0, -1).join("/");
      if (current) {
        mockState.directories.add(current);
      }
    }
  };

  const mockFileSystem = createMockFileSystem(mockState);
  const loadedAddons: { addonFilePath: string }[] = [];

  const systemInterface = {
    fileSystem: mockFileSystem,
    loadAddonAtPath: ({ addonFilePath }: { addonFilePath: string }) => {
      loadedAddons.push({ addonFilePath });
      return { native: true, path: addonFilePath };
    },
  };

  return {
    addFile,
    addDirectory,
    systemInterface,
    loadedAddons,
  };
};

describe("createNativeAddonLoader", () => {
  describe("successful load scenarios", () => {
    it("should load addon from Release folder when it exists", () => {
      const scenario = createTestScenario();
      const ourScriptPath = "/project/lib/snippets/native-loader.ts";

      scenario.addFile("/project/package.json");
      scenario.addDirectory("/project/build/Release");
      scenario.addFile("/project/build/Release/addon.node");

      const loader = createNativeAddonLoader({
        systemInterface: scenario.systemInterface,
        ourScriptPath,
      });

      const result = loader.loadRelativeToPackageRoot({
        relativeBuildFolderPath: "build",
      });

      nodeAssert.deepStrictEqual(result, { native: true, path: "/project/build/Release/addon.node" });
      nodeAssert.strictEqual(scenario.loadedAddons.length, 1);
      nodeAssert.strictEqual(scenario.loadedAddons[0].addonFilePath, "/project/build/Release/addon.node");
    });

    it("should load addon from Debug folder when Release does not exist", () => {
      const scenario = createTestScenario();
      const ourScriptPath = "/project/lib/snippets/native-loader.ts";

      scenario.addFile("/project/package.json");
      scenario.addDirectory("/project/build/Debug");
      scenario.addFile("/project/build/Debug/addon.node");

      const loader = createNativeAddonLoader({
        systemInterface: scenario.systemInterface,
        ourScriptPath,
      });

      const result = loader.loadRelativeToPackageRoot({
        relativeBuildFolderPath: "build",
      });

      nodeAssert.deepStrictEqual(result, { native: true, path: "/project/build/Debug/addon.node" });
      nodeAssert.strictEqual(scenario.loadedAddons.length, 1);
      nodeAssert.strictEqual(scenario.loadedAddons[0].addonFilePath, "/project/build/Debug/addon.node");
    });

    it("should find package.json in parent directory", () => {
      const scenario = createTestScenario();
      const ourScriptPath = "/project/lib/snippets/native-loader.ts";

      scenario.addFile("/project/package.json");
      scenario.addDirectory("/project/build/Release");
      scenario.addFile("/project/build/Release/addon.node");

      const loader = createNativeAddonLoader({
        systemInterface: scenario.systemInterface,
        ourScriptPath,
      });

      const result = loader.loadRelativeToPackageRoot({
        relativeBuildFolderPath: "build",
      });

      nodeAssert.deepStrictEqual(result, { native: true, path: "/project/build/Release/addon.node" });
    });

    it("should find package.json multiple levels up", () => {
      const scenario = createTestScenario();
      const ourScriptPath = "/project/lib/snippets/deeply/nested/native-loader.ts";

      scenario.addFile("/project/package.json");
      scenario.addDirectory("/project/build/Release");
      scenario.addFile("/project/build/Release/addon.node");

      const loader = createNativeAddonLoader({
        systemInterface: scenario.systemInterface,
        ourScriptPath,
      });

      const result = loader.loadRelativeToPackageRoot({
        relativeBuildFolderPath: "build",
      });

      nodeAssert.deepStrictEqual(result, { native: true, path: "/project/build/Release/addon.node" });
    });

    it("should load addon with different extension patterns", () => {
      const scenario = createTestScenario();
      const ourScriptPath = "/myapp/lib/loader.ts";

      scenario.addFile("/myapp/package.json");
      scenario.addDirectory("/myapp/native/Release");
      scenario.addFile("/myapp/native/Release/binding.node");

      const loader = createNativeAddonLoader({
        systemInterface: scenario.systemInterface,
        ourScriptPath,
      });

      const result = loader.loadRelativeToPackageRoot({
        relativeBuildFolderPath: "native",
      });

      nodeAssert.deepStrictEqual(result, { native: true, path: "/myapp/native/Release/binding.node" });
    });
  });

  describe("package.json discovery errors", () => {
    it("should throw when package.json not found within maxUpwardSteps", () => {
      const scenario = createTestScenario();
      const ourScriptPath = "/project/lib/snippets/native-loader.ts";

      scenario.addDirectory("/project/build/Release");
      scenario.addFile("/project/build/Release/addon.node");

      const loader = createNativeAddonLoader({
        systemInterface: scenario.systemInterface,
        ourScriptPath,
      });

      nodeAssert.throws(
        () => {
          loader.loadRelativeToPackageRoot({
            relativeBuildFolderPath: "build",
          });
        },
        (err: Error) => {
          return err.message.includes("could not find our package root") &&
            err.message.includes("make sure to keep the package structure intact when distributing the package");
        }
      );
    });

    it("should throw with proper error cause when package.json not found", () => {
      const scenario = createTestScenario();
      const ourScriptPath = "/deep/nested/path/lib/snippets/native-loader.ts";

      const loader = createNativeAddonLoader({
        systemInterface: scenario.systemInterface,
        ourScriptPath,
      });

      nodeAssert.throws(
        () => {
          loader.loadRelativeToPackageRoot({
            relativeBuildFolderPath: "build",
          });
        },
        (err: Error) => {
          const cause = err.cause as Error;
          return err.cause instanceof Error &&
            cause.message.includes("Could not find package.json");
        }
      );
    });
  });

  describe("build folder errors", () => {
    it("should throw when build folder does not exist", () => {
      const scenario = createTestScenario();
      const ourScriptPath = "/project/lib/snippets/native-loader.ts";

      scenario.addFile("/project/package.json");

      const loader = createNativeAddonLoader({
        systemInterface: scenario.systemInterface,
        ourScriptPath,
      });

      nodeAssert.throws(
        () => {
          loader.loadRelativeToPackageRoot({
            relativeBuildFolderPath: "build",
          });
        },
        (err: Error) => {
          return err.message === `no build folder found at our package root "/project/build", make sure to build the native addon first`;
        }
      );
    });
  });

  describe("build folder structure errors", () => {
    it("should throw when neither Debug nor Release folder exists", () => {
      const scenario = createTestScenario();
      const ourScriptPath = "/project/lib/snippets/native-loader.ts";

      scenario.addFile("/project/package.json");
      scenario.addDirectory("/project/build");

      const loader = createNativeAddonLoader({
        systemInterface: scenario.systemInterface,
        ourScriptPath,
      });

      nodeAssert.throws(
        () => {
          loader.loadRelativeToPackageRoot({
            relativeBuildFolderPath: "build",
          });
        },
        (err: Error) => {
          return err.message.includes("invalid build folder structure") &&
            (err.cause as Error).message.includes("neither Debug nor Release build folders found");
        }
      );
    });

    it("should throw when both Debug and Release folders exist", () => {
      const scenario = createTestScenario();
      const ourScriptPath = "/project/lib/snippets/native-loader.ts";

      scenario.addFile("/project/package.json");
      scenario.addDirectory("/project/build/Debug");
      scenario.addDirectory("/project/build/Release");
      scenario.addFile("/project/build/Debug/addon.node");
      scenario.addFile("/project/build/Release/addon.node");

      const loader = createNativeAddonLoader({
        systemInterface: scenario.systemInterface,
        ourScriptPath,
      });

      nodeAssert.throws(
        () => {
          loader.loadRelativeToPackageRoot({
            relativeBuildFolderPath: "build",
          });
        },
        (err: Error) => {
          return err.message.includes("invalid build folder structure") &&
            (err.cause as Error).message.includes("both Debug and Release build folders exist");
        }
      );
    });
  });

  describe("addon file discovery errors", () => {
    it("should throw when no .node file found in addon folder", () => {
      const scenario = createTestScenario();
      const ourScriptPath = "/project/lib/snippets/native-loader.ts";

      scenario.addFile("/project/package.json");
      scenario.addDirectory("/project/build/Release");

      const loader = createNativeAddonLoader({
        systemInterface: scenario.systemInterface,
        ourScriptPath,
      });

      nodeAssert.throws(
        () => {
          loader.loadRelativeToPackageRoot({
            relativeBuildFolderPath: "build",
          });
        },
        (err: Error) => {
          return err.message === `no .node addon file found in build folder "/project/build/Release"`;
        }
      );
    });

    it("should throw when no .node file found (only other files)", () => {
      const scenario = createTestScenario();
      const ourScriptPath = "/project/lib/snippets/native-loader.ts";

      scenario.addFile("/project/package.json");
      scenario.addDirectory("/project/build/Release");
      scenario.addFile("/project/build/Release/addon.so");
      scenario.addFile("/project/build/Release/README.txt");

      const loader = createNativeAddonLoader({
        systemInterface: scenario.systemInterface,
        ourScriptPath,
      });

      nodeAssert.throws(
        () => {
          loader.loadRelativeToPackageRoot({
            relativeBuildFolderPath: "build",
          });
        },
        (err: Error) => {
          return err.message === `no .node addon file found in build folder "/project/build/Release"`;
        }
      );
    });

    it("should throw when multiple .node files exist", () => {
      const scenario = createTestScenario();
      const ourScriptPath = "/project/lib/snippets/native-loader.ts";

      scenario.addFile("/project/package.json");
      scenario.addDirectory("/project/build/Release");
      scenario.addFile("/project/build/Release/addon1.node");
      scenario.addFile("/project/build/Release/addon2.node");

      const loader = createNativeAddonLoader({
        systemInterface: scenario.systemInterface,
        ourScriptPath,
      });

      nodeAssert.throws(
        () => {
          loader.loadRelativeToPackageRoot({
            relativeBuildFolderPath: "build",
          });
        },
        (err: Error) => {
          const expectedMsg = "multiple .node addon files found in build folder";
          return err.message.includes(expectedMsg) &&
            err.message.includes("cannot determine which to load");
        }
      );
    });
  });

  describe("edge cases", () => {
    it("should correctly resolve absolute path to addon file", () => {
      const scenario = createTestScenario();
      const ourScriptPath = "/workspace/project/lib/native-loader.ts";

      scenario.addFile("/workspace/project/package.json");
      scenario.addDirectory("/workspace/project/build/Release");
      scenario.addFile("/workspace/project/build/Release/addon.node");

      const loader = createNativeAddonLoader({
        systemInterface: scenario.systemInterface,
        ourScriptPath,
      });

      loader.loadRelativeToPackageRoot({
        relativeBuildFolderPath: "build",
      });

      nodeAssert.strictEqual(scenario.loadedAddons.length, 1);
      // Should be an absolute path
      nodeAssert.ok(scenario.loadedAddons[0].addonFilePath.startsWith("/"));
    });

    it("should handle nested build folder paths", () => {
      const scenario = createTestScenario();
      const ourScriptPath = "/project/lib/loader.ts";

      scenario.addFile("/project/package.json");
      scenario.addDirectory("/project/out/build/Release");
      scenario.addFile("/project/out/build/Release/native.node");

      const loader = createNativeAddonLoader({
        systemInterface: scenario.systemInterface,
        ourScriptPath,
      });

      const result = loader.loadRelativeToPackageRoot({
        relativeBuildFolderPath: "out/build",
      });

      nodeAssert.deepStrictEqual(result, { native: true, path: "/project/out/build/Release/native.node" });
    });

    it("should prefer Release over Debug when both exist would throw", () => {
      // This test verifies the logic path, though both existing is an error
      const scenario = createTestScenario();
      const ourScriptPath = "/project/lib/loader.ts";

      scenario.addFile("/project/package.json");
      scenario.addDirectory("/project/build/Debug");
      scenario.addDirectory("/project/build/Release");

      const loader = createNativeAddonLoader({
        systemInterface: scenario.systemInterface,
        ourScriptPath,
      });

      // Should throw because both exist
      nodeAssert.throws(
        () => {
          loader.loadRelativeToPackageRoot({
            relativeBuildFolderPath: "build",
          });
        }
      );
    });

    it("should handle paths with dots in folder names", () => {
      const scenario = createTestScenario();
      const ourScriptPath = "/my-project/lib/loader.ts";

      scenario.addFile("/my-project/package.json");
      scenario.addDirectory("/my-project/out.build/Release");
      scenario.addFile("/my-project/out.build/Release/addon.node");

      const loader = createNativeAddonLoader({
        systemInterface: scenario.systemInterface,
        ourScriptPath,
      });

      const result = loader.loadRelativeToPackageRoot({
        relativeBuildFolderPath: "out.build",
      });

      nodeAssert.deepStrictEqual(result, { native: true, path: "/my-project/out.build/Release/addon.node" });
    });
  });

  describe("loader return interface", () => {
    it("should return object with loadRelativeToPackageRoot method", () => {
      const scenario = createTestScenario();
      const ourScriptPath = "/project/lib/loader.ts";

      scenario.addFile("/project/package.json");
      scenario.addDirectory("/project/build/Release");
      scenario.addFile("/project/build/Release/addon.node");

      const loader = createNativeAddonLoader({
        systemInterface: scenario.systemInterface,
        ourScriptPath,
      });

      nodeAssert.ok(typeof loader === "object");
      nodeAssert.ok(typeof loader.loadRelativeToPackageRoot === "function");
      nodeAssert.strictEqual(Object.keys(loader).length, 1);
    });

    it("should instantiate default native addon loader", () => {
      const loader = createDefaultNativeAddonLoader();

      nodeAssert.ok(typeof loader === "object");
      nodeAssert.ok(typeof loader.loadRelativeToPackageRoot === "function");
    });
  });

  describe("filesystem root boundary", () => {
    it("should stop searching when reaching filesystem root", () => {
      const scenario = createTestScenario();
      const ourScriptPath = "/lib/loader.ts";

      scenario.addDirectory("/lib");

      const loader = createNativeAddonLoader({
        systemInterface: scenario.systemInterface,
        ourScriptPath,
      });

      nodeAssert.throws(
        () => {
          loader.loadRelativeToPackageRoot({
            relativeBuildFolderPath: "build",
          });
        },
        (err: Error) => {
          return err.message.includes("could not find our package root");
        }
      );
    });
  });

  describe("addon loading integration", () => {
    it("should load addon and return the loaded module", () => {
      const scenario = createTestScenario();
      const ourScriptPath = "/app/src/loader.ts";

      scenario.addFile("/app/package.json");
      scenario.addDirectory("/app/dist/Release");
      scenario.addFile("/app/dist/Release/native.node");

      const loader = createNativeAddonLoader({
        systemInterface: scenario.systemInterface,
        ourScriptPath,
      });

      const result = loader.loadRelativeToPackageRoot({
        relativeBuildFolderPath: "dist",
      });

      nodeAssert.deepStrictEqual(result, { native: true, path: "/app/dist/Release/native.node" });
    });

    it("should call loadAddonAtPath with correct resolved path", () => {
      const scenario = createTestScenario();
      const ourScriptPath = "/myapp/lib/index.ts";

      scenario.addFile("/myapp/package.json");
      scenario.addDirectory("/myapp/build/Release");
      scenario.addFile("/myapp/build/Release/binding.node");

      const loader = createNativeAddonLoader({
        systemInterface: scenario.systemInterface,
        ourScriptPath,
      });

      loader.loadRelativeToPackageRoot({
        relativeBuildFolderPath: "build",
      });

      nodeAssert.strictEqual(scenario.loadedAddons.length, 1);
      const addonPath = scenario.loadedAddons[0].addonFilePath;
      nodeAssert.ok(addonPath.endsWith("binding.node"));
      nodeAssert.ok(addonPath.includes("/myapp/build/Release"));
    });
  });
});
