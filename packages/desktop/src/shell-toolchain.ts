import { execSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

/**
 * The native toolchain the generated shell (mode 1) needs to build/run, and
 * the provisioning steps around it. `cargo tauri dev|build` compiles the
 * generated crate — but tauri-build validates two things AT COMPILE TIME that
 * must exist first (both confirmed against a live `cargo check`):
 *   - the node sidecar `binaries/node-<triple>` (externalBin), and
 *   - `icons/icon.ico` on Windows (the app's Win32 resource).
 * So dev/build provision the sidecar + icon set before invoking tauri, and
 * fail with install guidance when cargo or the Tauri CLI is absent — a
 * missing executable must read as a clear instruction, never a deep cargo
 * stack trace.
 */

export interface NodeTarget {
  triple: string;
  dist: string;
  /** Path within the extracted archive (POSIX) / "node.exe" on Windows. */
  bin: string;
  ext: string;
}

/** The Node release triple for a build host — the sidecar filename tauri
 * resolves (`node-<triple>`). Pure, so the mapping is unit-tested. */
export function nodeSidecarTarget(
  platform: NodeJS.Platform,
  arch: string,
): NodeTarget {
  const table: Record<string, NodeTarget | undefined> = {
    "win32 x64": {
      triple: "x86_64-pc-windows-msvc",
      dist: "win-x64",
      bin: "node.exe",
      ext: ".exe",
    },
    "darwin arm64": {
      triple: "aarch64-apple-darwin",
      dist: "darwin-arm64",
      bin: "bin/node",
      ext: "",
    },
    "darwin x64": {
      triple: "x86_64-apple-darwin",
      dist: "darwin-x64",
      bin: "bin/node",
      ext: "",
    },
    "linux x64": {
      triple: "x86_64-unknown-linux-gnu",
      dist: "linux-x64",
      bin: "bin/node",
      ext: "",
    },
  };
  const target = table[`${platform} ${arch}`];
  if (!target) {
    throw new Error(
      `No Node sidecar mapping for ${platform} ${arch} — the desktop shell ` +
        `supports win32/x64, darwin/arm64, darwin/x64, linux/x64.`,
    );
  }
  return target;
}

/** Fetch the stock Node the shell ships as its sidecar into `<shellDir>/
 * binaries`, named per target triple. No-op when already present. Ported from
 * the reference repo's fetch-node.mjs (the builder has no such script). */
export function fetchNodeSidecar(
  shellDir: string,
  version: string = process.versions.node,
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch,
): string {
  const target = nodeSidecarTarget(platform, arch);
  const binariesDir = path.join(shellDir, "binaries");
  fs.mkdirSync(binariesDir, { recursive: true });
  const dest = path.join(binariesDir, `node-${target.triple}${target.ext}`);
  if (fs.existsSync(dest)) return dest;

  if (platform === "win32") {
    const url = `https://nodejs.org/dist/v${version}/win-x64/node.exe`;
    execSync(`curl -fsSL -o "${dest}" "${url}"`, { stdio: "inherit" });
  } else {
    const name = `node-v${version}-${target.dist}`;
    const url = `https://nodejs.org/dist/v${version}/${name}.tar.gz`;
    execSync(
      `curl -fsSL "${url}" | tar -xz -C "${binariesDir}" --strip-components=2 ${name}/${target.bin}`,
      { stdio: "inherit", shell: "/bin/sh" },
    );
    fs.renameSync(path.join(binariesDir, "node"), dest);
    fs.chmodSync(dest, 0o755);
  }
  return dest;
}

/** Default bundle targets for the build host (`cargo tauri build --bundles`).
 * macOS gets app+dmg, Windows nsis, Linux deb+appimage — a host only builds
 * installers it can produce. */
export function tauriBundlesForHost(
  platform: NodeJS.Platform = process.platform,
): string[] {
  switch (platform) {
    case "darwin":
      return ["app", "dmg"];
    case "win32":
      return ["nsis"];
    default:
      return ["deb", "appimage"];
  }
}

export interface TauriCommand {
  /** The executable to spawn (e.g. "cargo" or a node path). */
  cmd: string;
  /** Args that precede the tauri subcommand (e.g. ["tauri"] for cargo). */
  prefix: string[];
  /** How the CLI was found — for logging + the preflight message. */
  via: "cargo-tauri" | "node-cli";
}

/** Spawn parameters that avoid DEP0190 (args array + shell:true): cargo on
 * Windows needs the shell for PATH/.exe + subcommand resolution — pass ONE
 * string, empty args; everything else runs argv directly (shell:false). The
 * joined tokens here are our own constants/paths, never user input. */
export function tauriSpawn(
  tauri: TauriCommand,
  subcommand: string[],
): { command: string; args: string[]; shell: boolean } {
  const argv = [...tauri.prefix, ...subcommand];
  if (tauri.cmd === "cargo" && process.platform === "win32") {
    return { command: ["cargo", ...argv].join(" "), args: [], shell: true };
  }
  return { command: tauri.cmd, args: argv, shell: false };
}

function probe(cmd: string, args: string[]): boolean {
  const onWin = process.platform === "win32";
  try {
    const r = spawnSync(
      onWin ? [cmd, ...args].join(" ") : cmd,
      onWin ? [] : args,
      { stdio: "ignore", shell: onWin },
    );
    return r.status === 0;
  } catch {
    return false;
  }
}

/** Is a Rust `cargo` on PATH? (needed to compile the shell crate). */
export function hasCargo(): boolean {
  return probe("cargo", ["--version"]);
}

/** Resolve a Tauri CLI: a global `cargo tauri`, else a `@tauri-apps/cli`
 * resolvable from the project. Returns null when neither is available. */
export function resolveTauriCommand(projectRoot: string): TauriCommand | null {
  if (probe("cargo", ["tauri", "--version"])) {
    return { cmd: "cargo", prefix: ["tauri"], via: "cargo-tauri" };
  }
  try {
    const require_ = createRequire(
      pathToFileURL(path.join(projectRoot, "package.json")).href,
    );
    // @tauri-apps/cli exposes its binary entry; resolve its package then bin.
    const pkgJson = require_.resolve("@tauri-apps/cli/package.json");
    const pkgDir = path.dirname(pkgJson);
    const pkg = JSON.parse(fs.readFileSync(pkgJson, "utf8")) as {
      bin?: string | Record<string, string>;
    };
    const bin = pkg.bin;
    const rel = typeof bin === "string" ? bin : bin?.tauri;
    if (rel) {
      return {
        cmd: process.execPath,
        prefix: [path.join(pkgDir, rel)],
        via: "node-cli",
      };
    }
  } catch {
    // not installed in the project
  }
  return null;
}

export interface Toolchain {
  cargo: boolean;
  tauri: TauriCommand | null;
}

export function detectToolchain(projectRoot: string): Toolchain {
  return { cargo: hasCargo(), tauri: resolveTauriCommand(projectRoot) };
}

/** Throw a clear, actionable error when the native toolchain is incomplete —
 * the desktop verbs call this before any cargo work so a missing executable
 * is an instruction, not a stack trace. */
export function preflightOrThrow(
  tc: Toolchain,
  hostName: string,
): TauriCommand {
  const missing: string[] = [];
  if (!tc.cargo) {
    missing.push(
      "  • Rust/cargo — install from https://rustup.rs (then restart your shell)",
    );
  }
  if (!tc.tauri) {
    missing.push(
      '  • Tauri CLI — `cargo install tauri-cli --version "^2"` ' +
        "(or add @tauri-apps/cli@^2 to your project's devDependencies)",
    );
  }
  if (missing.length > 0 || !tc.tauri) {
    throw new Error(
      `hosts/${hostName}: the desktop shell needs a native toolchain that is ` +
        `not installed:\n${missing.join("\n")}\n` +
        `Install the above, then re-run \`ph run ${hostName} dev\` / ` +
        `\`ph run ${hostName} build\`. (The headless stack — \`ph run ` +
        `${hostName}\` — needs none of this.)`,
    );
  }
  return tc.tauri;
}

/** `<tauri> icon <source>` — generates the per-platform icon set (icon.ico +
 * icon.icns + pngs) the bundle references and tauri-build requires. */
export function runTauriIcon(
  tauri: TauriCommand,
  shellDir: string,
  iconSource: string,
): void {
  const { command, args, shell } = tauriSpawn(tauri, ["icon", iconSource]);
  const r = spawnSync(command, args, {
    cwd: shellDir,
    stdio: "inherit",
    shell,
  });
  if (r.status !== 0) {
    throw new Error(
      `\`tauri icon ${iconSource}\` failed (exit ${r.status ?? "?"}) in ` +
        `${shellDir} — check that app.icon is a square PNG.`,
    );
  }
}
