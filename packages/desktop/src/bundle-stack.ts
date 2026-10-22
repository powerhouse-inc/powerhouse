import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

/**
 * P6.3 — stage the shippable STACK into the shell project: everything the
 * installed app needs to run `ph run desktop` with no environment at all
 * (D6.c). The shell's resources map `../dist-stack` → `stack`, and its
 * uniform-runners mode falls back to `resources/stack` when the env pair is
 * absent. Layout:
 *
 *   dist-stack/
 *     hosts/                     the project's host files
 *     agents/                    when present
 *     powerhouse.config.json
 *     package.json               minimal, names the project
 *     dist/                      the package's build (ph build)
 *     .ph/connect-build/dist/    the BUILT Connect (ph run connect build)
 *     node_modules/              vendored @powerhousedao/ph-cli (hoisted,
 *                                real files — computed-specifier imports and
 *                                PGlite wasm forbid bundling)
 */
const CONNECT_BUILD_DIR = path.join(".ph", "connect-build", "dist");

export interface BundleStackOptions {
  projectRoot: string;
  shellProjectDir: string;
  /** Vendor the runtime packages (slow). Skipped when false — an existing
   * vendored tree is left in place. */
  vendor?: boolean;
  /** The ph-cli version/tag to vendor. Default: "dev". NOTE: the vendored
   * ph-cli must carry the `run` command — registry tags published before
   * uniform-runners landed cannot run a stack; until a nightly catches up,
   * pass `phCliSpec` with a locally packed tarball instead. */
  phCliVersion?: string;
  /** Overrides the ph-cli install spec entirely (e.g. a `pnpm pack` tarball
   * path for a not-yet-published build). */
  phCliSpec?: string;
  /** A directory of `pnpm pack` tarballs (env PH_DESKTOP_LOCAL_PACKAGES).
   * Each replaces its package everywhere in the vendored tree: a packed
   * ph-cli alone would still pull its dependencies, at the same version
   * number, from the registry. `pnpm pack:desktop-stack` in the monorepo
   * packs the set ph-cli and host-core need. */
  localPackagesDir?: string;
  /** The connect member's port — written into the stack's shell.json so the
   * shell knows where to probe/navigate with no environment at all. */
  connectPort?: number;
  /** Absolute paths to skip when staging `hosts/` — in mode 1 the generated
   * shell dir sits under `hosts/` and must not be copied into itself. */
  excludeDirs?: string[];
  logger?: (message: string) => void;
}

export interface BundleStackResult {
  stackDir: string;
  vendored: boolean;
}

function copyIfExists(from: string, to: string): boolean {
  if (!fs.existsSync(from)) return false;
  fs.cpSync(from, to, { recursive: true });
  return true;
}

/**
 * Recursively copy `src` → `dest`, skipping any path in `excludes`. Unlike
 * fs.cpSync this tolerates `dest` living INSIDE `src`: in mode 1 the generated
 * shell (and its `dist-stack`) sits under `hosts/<desktop>/`, so staging the
 * project's `hosts/` straight into the shell would be a copy-into-self that
 * cpSync rejects outright. Excluding the shell subtree both avoids that and
 * keeps the crate + node sidecar out of the shippable stack.
 */
function copyDirFiltered(
  src: string,
  dest: string,
  excludes: string[],
): boolean {
  if (!fs.existsSync(src)) return false;
  const skip = new Set(excludes.map((e) => path.resolve(e)));
  const walk = (s: string, d: string): void => {
    if (skip.has(path.resolve(s))) return;
    const stat = fs.statSync(s);
    if (stat.isDirectory()) {
      fs.mkdirSync(d, { recursive: true });
      for (const entry of fs.readdirSync(s)) {
        walk(path.join(s, entry), path.join(d, entry));
      }
    } else {
      fs.copyFileSync(s, d);
    }
  };
  walk(src, dest);
  return true;
}

/** The npm spec of each tarball in `dir`, by the package name inside it. */
export function readLocalPackages(dir: string): Record<string, string> {
  const root = path.resolve(dir);
  const tarballs = fs.existsSync(root)
    ? fs.readdirSync(root).filter((f) => f.endsWith(".tgz"))
    : [];
  if (tarballs.length === 0) {
    throw new Error(`bundle-stack: no package tarballs (*.tgz) in ${root}`);
  }
  const specs: Record<string, string> = {};
  for (const file of tarballs.sort()) {
    const tarball = path.join(root, file);
    const manifest = spawnSync(
      "tar",
      ["-xzOf", tarball, "package/package.json"],
      {
        encoding: "utf8",
        windowsHide: true,
      },
    );
    if (manifest.status !== 0) {
      throw new Error(
        `bundle-stack: ${tarball} has no package/package.json: ${manifest.stderr}`,
      );
    }
    const { name } = JSON.parse(manifest.stdout) as { name: string };
    if (specs[name]) {
      throw new Error(
        `bundle-stack: two tarballs for ${name} in ${root} (a stale pack?): ` +
          `${specs[name].slice("file:".length)} and ${tarball}`,
      );
    }
    specs[name] = `file:${tarball}`;
  }
  return specs;
}

export interface StackManifestOptions {
  name: string;
  /** The registry version for what `local` lacks. */
  version: string;
  phCliSpec?: string;
  /** Package name → spec, from readLocalPackages. */
  local?: Record<string, string>;
}

/**
 * The staged stack's package.json. With local packages, every one is an
 * override (so transitive dependents get it too) and the direct dependencies
 * name the same spec: npm rejects an override that contradicts one.
 */
export function stackManifest(options: StackManifestOptions) {
  const local = options.local ?? {};
  const spec = (pkg: string, fallback: string) => local[pkg] ?? fallback;
  return {
    name: options.name,
    private: true,
    type: "module",
    dependencies: {
      "@powerhousedao/ph-cli": spec(
        "@powerhousedao/ph-cli",
        options.phCliSpec ?? options.version,
      ),
      "@powerhousedao/host-core": spec(
        "@powerhousedao/host-core",
        options.version,
      ),
    },
    ...(Object.keys(local).length > 0 ? { overrides: local } : {}),
  };
}

/** A vendored tree installed from local tarballs: the same version numbers
 * as the registry's, so npm would take either for the other. */
function vendoredFromLocal(stackDir: string): boolean {
  const lock = path.join(stackDir, "package-lock.json");
  return (
    fs.existsSync(lock) &&
    fs.readFileSync(lock, "utf8").includes('"resolved": "file:')
  );
}

export function bundleStack(options: BundleStackOptions): BundleStackResult {
  const log = options.logger ?? console.log;
  const stackDir = path.join(options.shellProjectDir, "dist-stack");

  // Fresh staging for project files; the vendored node_modules survives
  // unless re-vendoring (it is by far the slowest part).
  for (const entry of [
    "hosts",
    "agents",
    "dist",
    ".ph",
    "powerhouse.config.json",
    "package.json",
  ]) {
    fs.rmSync(path.join(stackDir, entry), { recursive: true, force: true });
  }
  fs.mkdirSync(stackDir, { recursive: true });

  // hosts/ gets the filtered copy — the generated shell subtree lives under
  // it and must not be copied into itself (nor shipped in the stack).
  const hostsStaged = copyDirFiltered(
    path.join(options.projectRoot, "hosts"),
    path.join(stackDir, "hosts"),
    options.excludeDirs ?? [],
  );
  log(`  hosts/ ${hostsStaged ? "staged" : "absent — skipped"}`);
  // The built Connect at the path the stack's connect runner serves by default.
  for (const dir of ["agents", "dist", CONNECT_BUILD_DIR]) {
    const copied = copyIfExists(
      path.join(options.projectRoot, dir),
      path.join(stackDir, dir),
    );
    log(`  ${dir}/ ${copied ? "staged" : "absent — skipped"}`);
  }

  // Inside the package there is no nested shell — the shell IS the window —
  // so the staged desktop host runs on the generic compound. Rewrite the
  // runner.module projection in the STAGED copy only.
  const stagedDesktopHost = path.join(stackDir, "hosts", "desktop", "host.js");
  if (fs.existsSync(stagedDesktopHost)) {
    const source = fs.readFileSync(stagedDesktopHost, "utf8");
    if (source.includes("@powerhousedao/desktop/runner")) {
      fs.writeFileSync(
        stagedDesktopHost,
        "// STAGED COPY (bundle-stack): runner.module rewritten to the generic\n" +
          "// compound — the packaged shell is the window; there is no nested shell.\n" +
          source.replace(
            /@powerhousedao\/desktop\/runner/g,
            "@powerhousedao/host-core/runners/compound",
          ),
      );
      log(
        "  hosts/desktop/host.js: runner rewritten to the generic compound (staged copy)",
      );
    }
  }
  copyIfExists(
    path.join(options.projectRoot, "powerhouse.config.json"),
    path.join(stackDir, "powerhouse.config.json"),
  );

  // shell.json: the stack's contract with the shell. The no-env (packaged)
  // path has nobody to set PH_WIN_CONNECT_PORT, so the shell reads the probe
  // and window port from here.
  if (typeof options.connectPort === "number") {
    fs.writeFileSync(
      path.join(stackDir, "shell.json"),
      `${JSON.stringify({ connectPort: options.connectPort }, null, 2)}\n`,
    );
    log(`  shell.json: connectPort ${options.connectPort}`);
  }

  // A minimal manifest: names the project (lock identity) and depends on
  // ph-cli so the vendored tree resolves exactly like a real install.
  const sourcePkg = JSON.parse(
    fs.readFileSync(path.join(options.projectRoot, "package.json"), "utf8"),
  ) as { name?: string };
  const version = options.phCliVersion ?? "dev";
  const name = sourcePkg.name ?? "powerhouse-desktop-stack";
  const vendor = options.vendor !== false;
  const local = options.localPackagesDir
    ? readLocalPackages(options.localPackagesDir)
    : undefined;
  // Switching between local and registry packages starts the tree afresh:
  // their version numbers match, so npm would keep whichever it has.
  if (vendor && (local || vendoredFromLocal(stackDir))) {
    for (const entry of ["node_modules", "package-lock.json"]) {
      fs.rmSync(path.join(stackDir, entry), { recursive: true, force: true });
    }
  }
  fs.writeFileSync(
    path.join(stackDir, "package.json"),
    `${JSON.stringify(
      local
        ? stackManifest({ name, version, phCliSpec: options.phCliSpec, local })
        : {
            name,
            private: true,
            type: "module",
            dependencies: { "@powerhousedao/ph-cli": version },
          },
      null,
      2,
    )}\n`,
  );

  let vendored = false;
  if (vendor) {
    // Local: the manifest names every spec. Registry: host-core rides along
    // with ph-cli, since host files resolve runner modules (the generic
    // compound) from the STACK's own node_modules.
    const specs = local
      ? ""
      : `"${options.phCliSpec ?? `@powerhousedao/ph-cli@${version}`}" "@powerhousedao/host-core@${version}"`;
    log(
      local
        ? `  vendoring ${Object.keys(local).length} local packages from ${options.localPackagesDir} (hoisted, real files)…`
        : `  vendoring ${specs} (hoisted, real files)…`,
    );
    // One command string: shell:true with an args ARRAY concatenates without
    // escaping (DEP0190 warns); the spec values are our own constants/paths.
    const result = spawnSync(
      `npm install ${specs} --install-strategy=hoisted --omit=dev --no-audit --no-fund`,
      { cwd: stackDir, stdio: "pipe", shell: true, windowsHide: true },
    );
    if (result.status !== 0) {
      throw new Error(
        `bundle-stack: vendoring failed (${result.status}):\n` +
          `${result.stderr.toString().slice(-800)}`,
      );
    }
    vendored = true;
  } else {
    log("  vendoring skipped (vendor: false) — existing tree left in place");
  }

  return { stackDir, vendored };
}
