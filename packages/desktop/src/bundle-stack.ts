import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  normalizePluginEntries,
  type PluginEntryData,
} from "@powerhousedao/host-core";

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

/** The package a module specifier belongs to. */
function packageOf(specifier: string): string {
  const parts = specifier.split("/");
  return parts.slice(0, specifier.startsWith("@") ? 2 : 1).join("/");
}

/** The packages to ship for a host's plugins. One that doesn't resolve is a
 * browser built-in of Connect's, already in the built app, and resolves no
 * better in the stack (host-core's plugins-resolve). */
export function pluginPackagesOf(
  entries: readonly PluginEntryData[],
  where: string,
  resolves: (specifier: string) => boolean,
): string[] {
  return normalizePluginEntries(entries, where)
    .filter((entry) => entry.enabled && !entry.module.startsWith("."))
    .filter((entry) => resolves(entry.module))
    .map((entry) => packageOf(entry.module));
}

/** Where a stack keeps the OAuth clients its config names. */
const OAUTH_CLIENTS_DIR = "oauth";

interface StagedConfig {
  workflows?: {
    oauthApps?: { id?: string; clients?: { desktop?: string; web?: string } }[];
  };
}

/**
 * The project's config, with its OAuth clients made the app's own. They sit
 * outside the project, so a packaged app would find nothing at those paths. A
 * desktop client ships with the app: it can't keep its secret, so sign-ins
 * always use PKCE. A web client belongs to a server and never leaves the machine.
 */
function stageConfig(
  projectRoot: string,
  stackDir: string,
  log: (message: string) => void,
): void {
  const source = path.join(projectRoot, "powerhouse.config.json");
  if (!fs.existsSync(source)) return;
  const config = JSON.parse(fs.readFileSync(source, "utf8")) as StagedConfig;
  for (const app of config.workflows?.oauthApps ?? []) {
    if (!app.clients) continue;
    const desktop = app.clients.desktop;
    const from = desktop && path.resolve(projectRoot, desktop);
    app.clients = {};
    if (!from || !fs.existsSync(from)) {
      log(`  oauth app ${app.id}: no desktop client, so it can't sign in`);
      continue;
    }
    const file = path.basename(from);
    fs.mkdirSync(path.join(stackDir, OAUTH_CLIENTS_DIR), { recursive: true });
    fs.copyFileSync(from, path.join(stackDir, OAUTH_CLIENTS_DIR, file));
    app.clients.desktop = `./${OAUTH_CLIENTS_DIR}/${file}`;
    log(`  oauth app ${app.id}: desktop client staged`);
  }
  fs.writeFileSync(
    path.join(stackDir, "powerhouse.config.json"),
    `${JSON.stringify(config, null, 2)}
`,
  );
}

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
  /** Packages the hosts' plugins come from. The stack resolves them from its
   * own node_modules, and ph-cli brings only what it depends on. */
  plugins?: readonly string[];
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
    // By name from its folder: GNU tar reads the `C:` of a Windows path as a host.
    const manifest = spawnSync("tar", ["-xzOf", file, "package/package.json"], {
      cwd: root,
      encoding: "utf8",
      windowsHide: true,
    });
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
  /** Packages to depend on besides ph-cli and host-core. */
  plugins?: readonly string[];
}

/**
 * The staged stack's package.json. With local packages, every one is an
 * override (so transitive dependents get it too) and the direct dependencies
 * name the same spec: npm rejects an override that contradicts one.
 */
export function stackManifest(options: StackManifestOptions) {
  const local = options.local ?? {};
  const spec = (pkg: string, fallback: string) => local[pkg] ?? fallback;
  const plugins = (options.plugins ?? []).map((pkg): [string, string] => [
    pkg,
    spec(pkg, options.version),
  ]);
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
      ...Object.fromEntries(plugins),
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
    OAUTH_CLIENTS_DIR,
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
  // The local key's process: the stack holds no @powerhousedao/desktop, and
  // this file needs nothing from it.
  const localKey = fileURLToPath(
    new URL("./local-key/local-key.mjs", import.meta.url),
  );
  if (fs.existsSync(localKey)) {
    fs.copyFileSync(localKey, path.join(stackDir, "local-key.mjs"));
  }
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
  stageConfig(options.projectRoot, stackDir, log);

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
  ) as { name?: string; version?: string; exports?: unknown };
  const version = options.phCliVersion ?? "dev";
  const name = sourcePkg.name ?? "powerhouse-desktop-stack";
  // The stack is the project's own package to the reactor, which loads it by
  // path: its pieces take this version, and workers find its models through
  // these exports. Without them the pieces are dropped, and a workflow pinned
  // to one quietly runs whatever the registry has instead.
  const project = {
    ...(sourcePkg.version ? { version: sourcePkg.version } : {}),
    ...(sourcePkg.exports ? { exports: sourcePkg.exports } : {}),
  };
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
      {
        ...(local
          ? stackManifest({
              name,
              version,
              phCliSpec: options.phCliSpec,
              local,
              plugins: options.plugins,
            })
          : {
              name,
              private: true,
              type: "module",
              dependencies: { "@powerhousedao/ph-cli": version },
            }),
        ...project,
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
      : [
          options.phCliSpec ?? `@powerhousedao/ph-cli@${version}`,
          `@powerhousedao/host-core@${version}`,
          ...(options.plugins ?? []).map((pkg) => `${pkg}@${version}`),
        ]
          .map((spec) => `"${spec}"`)
          .join(" ");
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
