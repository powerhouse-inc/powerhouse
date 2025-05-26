import {
  appendToHtmlHead,
  copyConnect,
  PH_DIR_NAME,
  resolveConnect,
} from "#connect-utils";
import { mkdir, rm } from "fs/promises";
import { join } from "path";
import {
  CONNECT_BUILD_ASSETS_DIR_NAME,
  CONNECT_BUILD_DIR_NAME,
  CONNECT_BUILD_DIST_DIR_NAME,
  CONNECT_BUILD_EXTERNAL_PACKAGES_CSS_FILE_NAME,
  DEFAULT_ASSETS_DIR_NAME,
  DEFAULT_EXTERNAL_PACKAGES_FILE_NAME,
  DEFAULT_STYLES_FILE_NAME,
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
    projectRoot = process.cwd(),
    assetsDirName = DEFAULT_ASSETS_DIR_NAME,
    externalPackagesFileName = DEFAULT_EXTERNAL_PACKAGES_FILE_NAME,
    stylesFileName = DEFAULT_STYLES_FILE_NAME,
    connectPath = resolveConnect(),
  } = options;

  // In this context, `project*` paths are relative to the project root
  // `connectBuild*` paths are relative to the Connect build directory
  const projectAssetsDir = join(projectRoot, assetsDirName);
  const projectExternalPackagesPath = join(
    projectRoot,
    externalPackagesFileName,
  );
  const projectStylesPath = join(projectRoot, stylesFileName);
  const connectBuildDir = join(
    projectRoot,
    PH_DIR_NAME,
    CONNECT_BUILD_DIR_NAME,
  );
  const connectBuildDistDir = join(
    connectBuildDir,
    CONNECT_BUILD_DIST_DIR_NAME,
  );
  const connectBuildAssetsDir = join(
    connectBuildDistDir,
    CONNECT_BUILD_ASSETS_DIR_NAME,
  );
  const externalPackagesStylesPath = join(
    connectBuildAssetsDir,
    CONNECT_BUILD_EXTERNAL_PACKAGES_CSS_FILE_NAME,
  );
  const connectBuildIndexHtmlPath = join(connectBuildDistDir, "index.html");

  // Remove and recreate the Connect build directory so that we are starting from scratch
  await rm(connectBuildDir, { recursive: true, force: true });
  await mkdir(connectBuildDir, { recursive: true });

  // Copy the Connect dist directory to the Connect build directory, this is either a local installation or the dist code from the installed npm package
  copyConnect(connectPath, connectBuildDistDir);

  // Bundle the external packages with esbuild so that they can be referenced asynchronously from the Connect build
  await bundleExternalPackages(
    projectExternalPackagesPath,
    connectBuildDistDir,
  );

  // Copy over assets in the project assets dir so that editors etc. that might need them can reference them with /assets
  await copyAssets(projectAssetsDir, connectBuildAssetsDir);

  // Run tailwind to build and bundle the CSS and output it to the Connect build dist assets directory
  await buildAndBundleCss(projectStylesPath, externalPackagesStylesPath);

  // Add a link to the built project styles, since the original Connect build does not know about them
  await appendToHtmlHead(
    connectBuildIndexHtmlPath,
    `<link rel="stylesheet" href="/${CONNECT_BUILD_ASSETS_DIR_NAME}/${CONNECT_BUILD_EXTERNAL_PACKAGES_CSS_FILE_NAME}">`,
  );
}
