import nodeFs from "node:fs";
import nodeUrl from "node:url";
import nodePath from "node:path";
import nodeModule from "node:module";

type TFileSystemInterface = {
  existsSync: (path: string) => boolean;
  readdirSync: (path: string) => string[];
};

type TSystemInterface = {
  fileSystem: TFileSystemInterface;
  loadAddonAtPath: (options: { addonFilePath: string }) => unknown;
};

const createNativeAddonLoader = ({
  systemInterface,
  ourScriptPath,
}: {
  systemInterface: TSystemInterface;
  ourScriptPath: string;
}) => {


  const findPackageJson = ({ startPath, maxUpwardSteps }: { startPath: string; maxUpwardSteps: number }) => {
    let currentPath = startPath;

    for (let i = 0; i < maxUpwardSteps; i += 1) {
      const packageJsonPath = nodePath.join(currentPath, "package.json");

      if (systemInterface.fileSystem.existsSync(packageJsonPath)) {
        return packageJsonPath;
      }

      const parentPath = nodePath.dirname(currentPath);

      // Reached filesystem root
      if (parentPath === currentPath) {
        break;
      }

      currentPath = parentPath;
    }

    throw new Error(`Could not find package.json within ${maxUpwardSteps} directory levels from ${startPath}`);
  };

  const findPackageRoot = ({ maxUpwardSteps }: { maxUpwardSteps: number }) => {
    const ourScriptDirectory = nodePath.dirname(ourScriptPath);

    const ourPackageJsonPath = findPackageJson({
      startPath: ourScriptDirectory,
      maxUpwardSteps,
    });

    const ourPackageRoot = nodePath.dirname(ourPackageJsonPath);

    return ourPackageRoot;
  };

  const findAddonInAddonFolder = ({ addonFolderPath }: { addonFolderPath: string }) => {
    const entries = systemInterface.fileSystem.readdirSync(addonFolderPath);

    const addonEntries = entries.filter((entry) => {
      return entry.endsWith(".node");
    });

    if (addonEntries.length === 0) {
      throw Error(`no .node addon file found in build folder "${addonFolderPath}"`);
    }

    if (addonEntries.length > 1) {
      throw Error(`multiple .node addon files found in build folder "${addonFolderPath}", cannot determine which to load`);
    }

    const addonFileName = addonEntries[0];

    return addonFileName;
  };

  const assertOnlyOneOfDebugOrReleaseExists = ({
    debugFolderExists,
    releaseFolderExists
  }: {
    debugFolderExists: boolean;
    releaseFolderExists: boolean
  }) => {
    if (debugFolderExists && releaseFolderExists) {
      throw Error(`both Debug and Release build folders exist, please remove one to avoid ambiguity`);
    }
  };

  const assertAtLeastOneOfDebugOrReleaseExists = ({
    debugFolderExists,
    releaseFolderExists
  }: {
    debugFolderExists: boolean;
    releaseFolderExists: boolean
  }) => {
    if (!debugFolderExists && !releaseFolderExists) {
      throw Error(`neither Debug nor Release build folders found, make sure to build the native addon first`);
    }
  };

  const determineReleaseOrDebugFolder = ({ buildFolderPath }: { buildFolderPath: string }) => {
    const debugFolderPath = nodePath.join(buildFolderPath, "Debug");
    const releaseFolderPath = nodePath.join(buildFolderPath, "Release");

    const debugFolderExists = systemInterface.fileSystem.existsSync(debugFolderPath);
    const releaseFolderExists = systemInterface.fileSystem.existsSync(releaseFolderPath);

    try {
      assertAtLeastOneOfDebugOrReleaseExists({ debugFolderExists, releaseFolderExists });
      assertOnlyOneOfDebugOrReleaseExists({ debugFolderExists, releaseFolderExists });
    } catch (ex) {
      throw Error(`invalid build folder structure at "${buildFolderPath}"`, { cause: ex });
    }

    const addonFolderPath = releaseFolderExists ? releaseFolderPath : debugFolderPath;

    return addonFolderPath;
  };

  const loadAddonFromFolder = ({ addonFolderPath }: { addonFolderPath: string }) => {
    const addonFileName = findAddonInAddonFolder({ addonFolderPath });

    const addonFilePath = nodePath.resolve(addonFolderPath, addonFileName);

    const native = systemInterface.loadAddonAtPath({ addonFilePath });

    return native;
  };

  const loadRelativeToPackageRoot = ({ relativeBuildFolderPath }: { relativeBuildFolderPath: string }) => {
    let packageRoot: string;

    try {
      packageRoot = findPackageRoot({ maxUpwardSteps: 10 });
    } catch (err) {
      let message = "could not find our package root";
      message += ", make sure to keep the package structure intact when distributing the package";
      message += " - a package.json and built addon at ./build are required";
      throw Error(message, { cause: err });
    }

    const buildFolderPath = nodePath.join(packageRoot, relativeBuildFolderPath);

    if (!systemInterface.fileSystem.existsSync(buildFolderPath)) {
      throw Error(`no build folder found at our package root "${buildFolderPath}", make sure to build the native addon first`);
    }

    const addonFolderPath = determineReleaseOrDebugFolder({ buildFolderPath });
    const native = loadAddonFromFolder({ addonFolderPath });

    return native;
  };

  return {
    loadRelativeToPackageRoot,
  };
};

const createDefaultSystemInterface = (): TSystemInterface => {

  /* c8 ignore start */
  const existsSync: TFileSystemInterface["existsSync"] = (path) => {
    return nodeFs.existsSync(path);
  };

  const readdirSync: TFileSystemInterface["readdirSync"] = (path) => {
    return nodeFs.readdirSync(path);
  };
  /* c8 ignore end */

  const fileSystem: TFileSystemInterface = {
    existsSync,
    readdirSync,
  };

  /* c8 ignore start */
  const loadAddonAtPath: TSystemInterface["loadAddonAtPath"] = ({ addonFilePath }) => {
    const require = nodeModule.createRequire(import.meta.url);
    const native = require(addonFilePath);
    return native;
  };
  /* c8 ignore end */

  return {
    fileSystem,
    loadAddonAtPath,
  };
};

const createDefaultNativeAddonLoader = () => {
  const systemInterface = createDefaultSystemInterface();
  const ourScriptUrl = import.meta.url;
  const ourScriptPath = nodeUrl.fileURLToPath(ourScriptUrl);

  const nativeAddonLoader = createNativeAddonLoader({
    systemInterface,
    ourScriptPath,
  });

  return nativeAddonLoader;
};

export {
  createNativeAddonLoader,
  createDefaultNativeAddonLoader
};
