import {
  appendToHtmlHead,
  copyConnect,
  makeImportScriptFromPackages,
  PH_DIR_NAME,
  prependToHtmlHead,
  resolveConnect,
  runTsc,
} from "#connect-utils";
import { getConfig } from "@powerhousedao/config";
import { mkdir, rm, writeFile } from "fs/promises";
import { join } from "path";
import {
  CONNECT_BUILD_ASSETS_DIR_NAME,
  CONNECT_BUILD_DIR_NAME,
  CONNECT_BUILD_DIST_DIR_NAME,
  CONNECT_BUILD_EXTERNAL_PACKAGES_CSS_FILE_NAME,
  CONNECT_BUILD_PROJECT_DIST_DIR_NAME,
  DEFAULT_ASSETS_DIR_NAME,
  DEFAULT_EXTERNAL_PACKAGES_FILE_NAME,
  DEFAULT_STYLES_FILE_NAME,
  POWERHOUSE_CONFIG_FILE_NAME,
} from "./constants.js";
import {
  buildAndBundleCss,
  bundleExternalPackages,
  copyAssets,
} from "./helpers.js";
import { type ConnectBuildOptions } from "./types.js";

/** Builds Connect with a given project's local and external packages included
 * @see {@link ConnectBuildOptions} for options
 */
export async function buildConnect(options: ConnectBuildOptions) {
  const {
    base = process.env.BASE_PATH || "/",
    projectRoot = process.cwd(),
    assetsDirName = DEFAULT_ASSETS_DIR_NAME,
    externalPackagesFileName = DEFAULT_EXTERNAL_PACKAGES_FILE_NAME,
    stylesFileName = DEFAULT_STYLES_FILE_NAME,
    connectPath = resolveConnect(),
  } = options;

  // In this context, `project*` paths are relative to the project root
  // `connectBuild*` paths are relative to the Connect build directory

  const connectBuildDir = join(
    projectRoot,
    PH_DIR_NAME,
    CONNECT_BUILD_DIR_NAME,
  );
  // Remove and recreate the Connect build directory so that we are starting from scratch
  await rm(connectBuildDir, { recursive: true, force: true });
  await mkdir(connectBuildDir, { recursive: true });

  // Copy the Connect dist directory to the Connect build directory, this is either a local installation or the dist code from the installed npm package
  const connectBuildDistDir = join(
    connectBuildDir,
    CONNECT_BUILD_DIST_DIR_NAME,
  );
  copyConnect(connectPath, connectBuildDistDir);

  // Run tsc to build the project
  const connectBuildProjectTscOutDir = join(
    connectBuildDir,
    CONNECT_BUILD_PROJECT_DIST_DIR_NAME,
  );
  runTsc(connectBuildProjectTscOutDir);

  // generate the external packages import script
  const projectPowerhouseConfigPath = join(
    projectRoot,
    POWERHOUSE_CONFIG_FILE_NAME,
  );
  const config = getConfig(projectPowerhouseConfigPath);
  const packages = config.packages?.map((p) => p.packageName) ?? [];
  const connectBuildProjectDistDir = join(
    connectBuildDir,
    CONNECT_BUILD_PROJECT_DIST_DIR_NAME,
  );
  const connectBuildProjectJsPath = join(
    connectBuildProjectDistDir,
    "index.js",
  );
  const externalPackagesImportScript = makeImportScriptFromPackages({
    packages,
    localJsPath: connectBuildProjectJsPath,
    importStyles: false,
  });
  const connectBuildExternalPackagesImportScriptPath = join(
    connectBuildDir,
    externalPackagesFileName,
  );
  await writeFile(
    connectBuildExternalPackagesImportScriptPath,
    externalPackagesImportScript,
  );

  // Bundle the external packages with esbuild so that they can be referenced asynchronously from the Connect build
  await bundleExternalPackages(
    connectBuildExternalPackagesImportScriptPath,
    connectBuildDistDir,
  );

  // Copy over assets in the project assets dir so that editors etc. that might need them can reference them with /assets
  const projectAssetsDir = join(projectRoot, assetsDirName);
  const connectBuildAssetsDir = join(
    connectBuildDistDir,
    CONNECT_BUILD_ASSETS_DIR_NAME,
  );
  await copyAssets(projectAssetsDir, connectBuildAssetsDir);

  // Run tailwind to build and bundle the CSS and output it to the Connect build dist assets directory
  const projectStylesPath = join(projectRoot, stylesFileName);
  const externalPackagesStylesPath = join(
    connectBuildAssetsDir,
    CONNECT_BUILD_EXTERNAL_PACKAGES_CSS_FILE_NAME,
  );
  await buildAndBundleCss(projectStylesPath, externalPackagesStylesPath);

  // Add a link to the built project styles, since the original Connect build does not know about them
  const connectBuildIndexHtmlPath = join(connectBuildDistDir, "index.html");
  await appendToHtmlHead(
    connectBuildIndexHtmlPath,
    `<link rel="stylesheet" href="./${CONNECT_BUILD_ASSETS_DIR_NAME}/${CONNECT_BUILD_EXTERNAL_PACKAGES_CSS_FILE_NAME}">`,
  );

  // Add base tag to index.html
  await prependToHtmlHead(
    connectBuildIndexHtmlPath,
    `<base href="${base}${base.endsWith("/") ? "" : "/"}">`,
  );
}
