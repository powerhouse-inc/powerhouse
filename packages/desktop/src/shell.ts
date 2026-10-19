import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

/**
 * Shell discovery and launch. The Rust/Tauri shell lives in the
 * ph-win-desktop repo (cargo cannot ride an npm package); the runner locates
 * a checkout via `runner.shell.project` or PH_DESKTOP_SHELL and prefers its
 * BUILT exe (dev config like window title is baked into a build — the
 * `--config` projection below applies to tauri-cli invocations only).
 */

export interface ShellOptions {
  /** Path to a ph-win-desktop checkout (absolute or project-relative). */
  project?: string;
  window?: { title?: string; width?: number; height?: number };
  tray?: boolean;
  fileAssociations?: string[];
}

export interface ResolvedShell {
  projectDir: string;
  /** A built exe when one exists (debug preferred for dev), else undefined →
   * fall back to `pnpm tauri dev`. */
  exe?: string;
}

export function resolveShell(
  projectRoot: string,
  options: ShellOptions | undefined,
  env: Record<string, string | undefined>,
): ResolvedShell {
  const configured = options?.project ?? env.PH_DESKTOP_SHELL;
  if (!configured) {
    throw new Error(
      "No desktop shell configured: set runner.shell.project in the host file " +
        "(path to a ph-win-desktop checkout) or the PH_DESKTOP_SHELL " +
        "environment variable. `ph run desktop` (headless stack) needs neither.",
    );
  }
  const projectDir = path.resolve(projectRoot, configured);
  if (!fs.existsSync(path.join(projectDir, "src-tauri"))) {
    throw new Error(
      `Desktop shell not found at ${projectDir} (no src-tauri/) — check ` +
        `runner.shell.project / PH_DESKTOP_SHELL.`,
    );
  }
  const candidates = [
    path.join(projectDir, "src-tauri", "target", "debug", "ph-win.exe"),
    path.join(projectDir, "src-tauri", "target", "release", "ph-win.exe"),
    path.join(projectDir, "src-tauri", "target", "debug", "ph-win"),
    path.join(projectDir, "src-tauri", "target", "release", "ph-win"),
  ];
  const exe = candidates.find((c) => fs.existsSync(c));
  return { projectDir, exe };
}

/** Resolve the project's ph-cli entry from ITS dependency tree — the same
 * resolution `ph run` itself uses. */
export function resolvePhCliEntry(projectRoot: string): string {
  const require_ = createRequire(
    pathToFileURL(path.join(projectRoot, "package.json")).href,
  );
  const pkgPath = require_.resolve("@powerhousedao/ph-cli/package.json");
  return path.join(path.dirname(pkgPath), "dist", "cli.mjs");
}

/** The env trio (plus flag and userData) the shell's uniform-runners mode
 * reads — wired by the RUNNER so nobody exports variables by hand. */
export function shellEnv(
  projectRoot: string,
  connectPort: number,
  env: Record<string, string | undefined>,
): Record<string, string> {
  return {
    FEATURE_UNIFORM_RUNNERS_ENABLED: "1",
    PH_RUN_PROJECT: projectRoot,
    PH_RUN_CLI: resolvePhCliEntry(projectRoot),
    PH_WIN_CONNECT_PORT: String(connectPort),
    ...(env.PH_USER_DATA_DIR ? { PH_USER_DATA_DIR: env.PH_USER_DATA_DIR } : {}),
  };
}

/** Project host shell options onto a tauri `--config` merge patch (D6.d) —
 * the host file stays the single source for app identity on tauri-cli
 * invocations; a built exe has these baked. */
export function tauriConfigPatch(
  options: ShellOptions | undefined,
): Record<string, unknown> | undefined {
  if (!options) return undefined;
  const patch: Record<string, unknown> = {};
  if (options.window) {
    patch.app = {
      windows: [
        {
          ...(options.window.title ? { title: options.window.title } : {}),
          ...(options.window.width ? { width: options.window.width } : {}),
          ...(options.window.height ? { height: options.window.height } : {}),
        },
      ],
    };
  }
  if (options.fileAssociations?.length) {
    patch.bundle = {
      fileAssociations: [
        {
          ext: options.fileAssociations.map((e) => e.replace(/^\./, "")),
          name: "Powerhouse Document",
        },
      ],
    };
  }
  return Object.keys(patch).length > 0 ? patch : undefined;
}

export function launchShell(
  shell: ResolvedShell,
  envVars: Record<string, string>,
  options: ShellOptions | undefined,
): ChildProcess {
  if (shell.exe) {
    return spawn(shell.exe, [], {
      cwd: shell.projectDir,
      env: { ...process.env, ...envVars },
      stdio: "inherit",
      windowsHide: true,
    });
  }
  // tauri dev (needs cargo); config projection applies here.
  const patch = tauriConfigPatch(options);
  const args = ["tauri", "dev"];
  if (patch) args.push("--config", JSON.stringify(patch));
  return spawn("pnpm", args, {
    cwd: shell.projectDir,
    env: { ...process.env, ...envVars },
    stdio: "inherit",
    shell: true,
    windowsHide: true,
  });
}
