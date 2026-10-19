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
  type AppJson,
  type AppJsonShellSource,
} from "./app-json.js";
export {
  bundleStack,
  type BundleStackOptions,
  type BundleStackResult,
} from "./bundle-stack.js";
export {
  projectShell,
  ICON_SOURCE,
  SHELL_DIR,
  type ProjectShellInput,
  type ProjectShellResult,
} from "./shell-project.js";
export {
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
