/**
 * @powerhousedao/desktop — the desktop runner for uniform-runners hosts
 * (phase 6). The runner module is the subpath export `./runner`; this barrel
 * exposes the composable pieces (shell resolution, env wiring, config
 * projection, stack staging) for the shell repo's own tooling.
 */

export {
  bundleStack,
  type BundleStackOptions,
  type BundleStackResult,
} from "./bundle-stack.js";
export {
  launchShell,
  resolvePhCliEntry,
  resolveShell,
  shellEnv,
  tauriConfigPatch,
  type ResolvedShell,
  type ShellOptions,
} from "./shell.js";
