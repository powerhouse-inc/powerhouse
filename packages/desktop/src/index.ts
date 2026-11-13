/**
 * @powerhousedao/desktop — the desktop runner for uniform-runners hosts
 * (phase 6). The runner module is the subpath export `./runner`; this barrel
 * exposes the composable pieces (shell resolution, env wiring, config
 * projection, stack staging) for the shell repo's own tooling.
 */

export {
  appJsonSchema,
  appSlug,
  loadAppJson,
  APP_JSON_FILE,
  DEFAULT_SHELL_CRATE_VERSION,
  updateEndpoints,
  type AppJson,
  type AppJsonShellSource,
  type AppJsonUpdates,
} from "./app-json.js";
export {
  bundleStack,
  pruneStack,
  type BundleStackOptions,
  type BundleStackResult,
} from "./bundle-stack.js";
export {
  projectShell,
  ICON_SOURCE,
  SHELL_DIR,
  UNSIGNED_BUILD_CONF,
  type ProjectShellInput,
  type ProjectShellResult,
} from "./shell-project.js";
export {
  collectRelease,
  feedFileName,
  releaseBaseUrl,
  releaseFileName,
  releaseReport,
  FEED_FILE_TEMPLATE,
  RELEASE_DIR,
  type CollectReleaseInput,
  type CollectedRelease,
} from "./release.js";
export {
  rebaseBackground,
  scaffoldDesktopShell,
  solidPng,
  type ScaffoldDesktopShellOptions,
  type ScaffoldResult,
} from "./scaffold.js";
export {
  detectToolchain,
  fetchNodeSidecar,
  nodeSidecarTarget,
  preflightOrThrow,
  resolveTauriCommand,
  runTauriIcon,
  tauriBuildArgs,
  tauriBundlesForHost,
  type NodeTarget,
  type TauriCommand,
  type Toolchain,
} from "./shell-toolchain.js";
export {
  launchShell,
  resolvePhCliEntry,
  resolveShell,
  shellEnv,
  tauriConfigPatch,
  type ResolvedShell,
  type ShellOptions,
} from "./shell.js";
export { bundleBackend, type BundleBackendResult } from "./bundle-backend.js";
