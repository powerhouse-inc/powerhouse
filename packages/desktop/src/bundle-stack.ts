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
 *     dist/                      the BUILT Connect (ph run connect build)
 *     node_modules/              vendored @powerhousedao/ph-cli (hoisted,
 *                                real files — computed-specifier imports and
 *                                PGlite wasm forbid bundling)
 */
export interface BundleStackOptions {
  projectRoot: string;
  shellProjectDir: string;
  /** Vendor @powerhousedao/ph-cli@<tag/version> from the registry (slow).
   * Skipped when false — an existing vendored tree is left in place. */
  vendor?: boolean;
  /** The ph-cli version/tag to vendor. Default: "dev". */
  phCliVersion?: string;
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

export function bundleStack(options: BundleStackOptions): BundleStackResult {
  const log = options.logger ?? console.log;
  const stackDir = path.join(options.shellProjectDir, "dist-stack");

  // Fresh staging for project files; the vendored node_modules survives
  // unless re-vendoring (it is by far the slowest part).
  for (const entry of [
    "hosts",
    "agents",
    "dist",
    "powerhouse.config.json",
    "package.json",
  ]) {
    fs.rmSync(path.join(stackDir, entry), { recursive: true, force: true });
  }
  fs.mkdirSync(stackDir, { recursive: true });

  for (const dir of ["hosts", "agents", "dist"]) {
    const copied = copyIfExists(
      path.join(options.projectRoot, dir),
      path.join(stackDir, dir),
    );
    log(`  ${dir}/ ${copied ? "staged" : "absent — skipped"}`);
  }
  copyIfExists(
    path.join(options.projectRoot, "powerhouse.config.json"),
    path.join(stackDir, "powerhouse.config.json"),
  );

  // A minimal manifest: names the project (lock identity) and depends on
  // ph-cli so the vendored tree resolves exactly like a real install.
  const sourcePkg = JSON.parse(
    fs.readFileSync(path.join(options.projectRoot, "package.json"), "utf8"),
  ) as { name?: string };
  const version = options.phCliVersion ?? "dev";
  fs.writeFileSync(
    path.join(stackDir, "package.json"),
    `${JSON.stringify(
      {
        name: sourcePkg.name ?? "powerhouse-desktop-stack",
        private: true,
        type: "module",
        dependencies: { "@powerhousedao/ph-cli": version },
      },
      null,
      2,
    )}\n`,
  );

  let vendored = false;
  if (options.vendor !== false) {
    log(`  vendoring @powerhousedao/ph-cli@${version} (hoisted, real files)…`);
    const result = spawnSync(
      "npm",
      [
        "install",
        `@powerhousedao/ph-cli@${version}`,
        "--install-strategy=hoisted",
        "--omit=dev",
        "--no-audit",
        "--no-fund",
      ],
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
