/**
 * Phase 3b (optional, best-effort): typecheck published packages against the
 * LOCAL workspace builds.
 *
 * For each target package this scaffolds a tiny standalone consumer project that
 * installs the published tarball, but with chosen dependencies overridden to the
 * local workspace packages (via pnpm `overrides` + `--ignore-workspace`), then
 * runs `tsc --noEmit` and reports the resulting type errors.
 *
 * This is generic - it knows nothing about any specific audit. It answers:
 * "do these published packages still typecheck against the current local build?"
 *
 * Caveats:
 *  - Packages that bundle/inline their dependency types won't surface breakage
 *    here (the pattern scan in analyze.ts is the better detector for that).
 *  - The local workspace packages must already be built (their dist/ present).
 *  - This installs a full dependency tree per package; it is slow.
 *
 * Usage:
 *   tsx tools/registry-audit/typecheck.ts [options]
 *
 * Options:
 *   --from-report           Only check packages flagged in report.json (default
 *                           if report.json exists; otherwise all extracted).
 *   --package <name>        Only check this package (repeatable).
 *   --override <pkg>=<dir>  Override <pkg> to a local dir (repeatable). Defaults
 *                           to every discovered workspace package under
 *                           packages/* and clis/*.
 *   --skip-install          Reuse a prior install in the scaffold dir.
 *   --limit <n>             Process at most n packages.
 */
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import {
  opt,
  parseArgs,
  REPO_ROOT,
  REPORT_PATH,
  requireManifest,
  run,
  runCapture,
  sanitize,
  TYPECHECK_DIR,
} from "./lib.js";

/** Discovers local workspace package name -> absolute dir under packages/* and clis/*. */
async function discoverWorkspacePackages(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (const group of ["packages", "clis"]) {
    const groupDir = join(REPO_ROOT, group);
    let dirs: string[];
    try {
      dirs = (await readdir(groupDir, { withFileTypes: true }))
        .filter((d) => d.isDirectory())
        .map((d) => d.name);
    } catch {
      continue;
    }
    for (const d of dirs) {
      const pkgDir = join(groupDir, d);
      try {
        const pkg = JSON.parse(
          await readFile(join(pkgDir, "package.json"), "utf8"),
        ) as { name?: string };
        if (pkg.name) map.set(pkg.name, pkgDir);
      } catch {
        /* no package.json */
      }
    }
  }
  return map;
}

async function loadReportFlagged(): Promise<Set<string> | null> {
  try {
    const report = JSON.parse(await readFile(REPORT_PATH, "utf8")) as {
      findings: { package: string }[];
    };
    return new Set(report.findings.map((f) => f.package));
  } catch {
    return null;
  }
}

const TSCONFIG = {
  compilerOptions: {
    module: "nodenext",
    moduleResolution: "nodenext",
    target: "es2022",
    strict: true,
    noEmit: true,
    skipLibCheck: false,
    types: [],
    jsx: "react-jsx",
  },
  include: ["index.ts"],
};

async function main() {
  const args = parseArgs(process.argv.slice(2), [
    "from-report",
    "skip-install",
  ]);

  const manifest = await requireManifest("tsx tools/registry-audit/extract.ts");
  const workspace = await discoverWorkspacePackages();

  // Build the override map: workspace defaults, then explicit --override wins.
  const overrides = new Map<string, string>();
  for (const [name, dir] of workspace) overrides.set(name, `link:${dir}`);
  for (const o of args.options.override ?? []) {
    const eq = o.indexOf("=");
    if (eq === -1) continue;
    overrides.set(o.slice(0, eq), `link:${join(REPO_ROOT, o.slice(eq + 1))}`);
  }

  // Determine targets.
  let entries = Object.values(manifest.packages).filter((e) => e.tarballPath);
  const wantPackages = new Set(args.options.package ?? []);
  if (wantPackages.size) {
    entries = entries.filter((e) => wantPackages.has(e.name));
  } else {
    const useReport = args.flags["from-report"] ?? true;
    if (useReport) {
      const flagged = await loadReportFlagged();
      if (flagged) entries = entries.filter((e) => flagged.has(e.name));
    }
  }
  const limit = args.options.limit ? Number(opt(args, "limit")) : undefined;
  if (limit !== undefined) entries = entries.slice(0, limit);

  console.log(
    `Typechecking ${entries.length} package(s) against local builds.\n`,
  );

  const results: { package: string; errors: number; ok: boolean }[] = [];

  for (const entry of entries) {
    const dir = join(TYPECHECK_DIR, sanitize(entry.name));
    await mkdir(dir, { recursive: true });

    const overridesObj = Object.fromEntries(overrides);
    const consumerPkg = {
      name: `audit-consumer-${sanitize(entry.name).replace(/[@/]/g, "")}`,
      private: true,
      type: "module",
      dependencies: {
        [entry.name]: `file:${entry.tarballPath}`,
      },
      pnpm: { overrides: overridesObj },
    };
    await writeFile(
      join(dir, "package.json"),
      JSON.stringify(consumerPkg, null, 2),
    );
    await writeFile(
      join(dir, "tsconfig.json"),
      JSON.stringify(TSCONFIG, null, 2),
    );
    await writeFile(
      join(dir, "index.ts"),
      `import * as pkg from "${entry.name}";\nvoid (pkg as unknown);\n`,
    );

    if (!args.flags["skip-install"]) {
      console.log(`  install ${entry.name}@${entry.version} ...`);
      const code = await run(
        "pnpm",
        ["install", "--ignore-workspace", "--no-frozen-lockfile", "--silent"],
        { cwd: dir, quiet: true },
      );
      if (code !== 0) {
        console.log(`  FAIL    ${entry.name}: pnpm install exited ${code}`);
        results.push({ package: entry.name, errors: -1, ok: false });
        continue;
      }
    }

    const tsc = await runCapture(
      join(REPO_ROOT, "node_modules", ".bin", "tsc"),
      ["--noEmit", "-p", "tsconfig.json"],
      { cwd: dir },
    );
    const errorLines = (tsc.stdout + tsc.stderr)
      .split("\n")
      .filter((l) => /error TS\d+/.test(l));
    const ok = tsc.code === 0;
    results.push({ package: entry.name, errors: errorLines.length, ok });

    if (ok) {
      console.log(`  ok      ${entry.name}`);
    } else {
      console.log(`  ERRORS  ${entry.name} (${errorLines.length})`);
      // Persist the full tsc output for inspection.
      await writeFile(join(dir, "tsc-errors.txt"), tsc.stdout + tsc.stderr);
      for (const l of errorLines.slice(0, 5)) {
        console.log(`            ${l.trim()}`);
      }
      if (errorLines.length > 5) {
        console.log(
          `            ... see ${relative(REPO_ROOT, join(dir, "tsc-errors.txt"))}`,
        );
      }
    }
  }

  const failed = results.filter((r) => !r.ok);
  console.log(
    `\nDone. ok=${results.length - failed.length} withErrors=${failed.length}`,
  );
  if (failed.length) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
