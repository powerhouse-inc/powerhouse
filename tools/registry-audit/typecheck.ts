/**
 * Phase 3b (optional, best-effort): typecheck published packages against the
 * LOCAL workspace builds.
 *
 * For each target package this scaffolds a tiny standalone consumer project that
 * installs the published tarball, then runs `tsc --noEmit` over an entry that
 * imports the package - but with selected dependencies redirected to the LOCAL
 * workspace builds via TypeScript `compilerOptions.paths`. tsc honours `paths`
 * for every import in the program, including the ones inside the published
 * package's own `.d.ts`, so the package is effectively type-checked against the
 * current local code.
 *
 * (We use tsc `paths` rather than pnpm `overrides` because pnpm does not apply
 * overrides in an `--ignore-workspace` standalone project.)
 *
 * This is generic - it knows nothing about any specific audit. It answers:
 * "do these published packages still typecheck against the current local build?"
 *
 * Caveats:
 *  - Packages that bundle/inline their dependency types won't surface breakage
 *    here (the pattern scan in analyze.ts is the better detector for that): the
 *    inlined copies don't reference the local package, so tsc sees nothing wrong.
 *  - The local workspace packages must already be built (their dist/ present).
 *  - This installs a full dependency tree per package; it is slow.
 *
 * Usage:
 *   tsx tools/registry-audit/typecheck.ts [options]
 *
 * Options:
 *   --from-report           Only check packages flagged in report.json.
 *   --package <name>        Only check this package (repeatable).
 *   --override <pkg>=<dir>  Redirect <pkg> to a local dir (repeatable). Defaults
 *                           to every discovered workspace package under
 *                           packages/* and clis/* that has built types.
 *   --skip-install          Reuse a prior install in the scaffold dir.
 *   --limit <n>             Process at most n packages.
 *
 * By default every extracted package is checked. Errors are scoped to the target
 * package's own files; the full tsc output is written to tsc-errors.txt.
 */
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import {
  opt,
  parseArgs,
  REPO_ROOT,
  REPORT_PATH,
  requireManifest,
  runCapture,
  sanitize,
  TYPECHECK_DIR,
  TYPECHECK_REPORT_PATH,
} from "./lib.js";

type PkgJson = {
  name?: string;
  types?: string;
  typings?: string;
  exports?: Record<string, unknown>;
};

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/** The "." types entry of a package.json, if declared. */
function typesEntry(pkg: PkgJson): string | undefined {
  const dot = pkg.exports?.["."];
  if (dot && typeof dot === "object") {
    const t = (dot as Record<string, unknown>).types;
    if (typeof t === "string") return t;
  }
  return pkg.types ?? pkg.typings;
}

type LocalPackage = { name: string; dir: string; types: string };

/**
 * Discovers local workspace packages under packages/* and clis/* that have a
 * declared, on-disk types entry (i.e. are built).
 */
async function discoverWorkspacePackages(): Promise<LocalPackage[]> {
  const out: LocalPackage[] = [];
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
        ) as PkgJson;
        const types = typesEntry(pkg);
        if (pkg.name && types && (await exists(join(pkgDir, types)))) {
          out.push({ name: pkg.name, dir: pkgDir, types });
        }
      } catch {
        /* no/invalid package.json */
      }
    }
  }
  return out;
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

/** Builds the tsconfig `paths` map that redirects local packages to their build. */
function buildPaths(locals: LocalPackage[]): Record<string, string[]> {
  const paths: Record<string, string[]> = {};
  for (const p of locals) {
    const distDir = join(p.dir, dirname(p.types));
    paths[p.name] = [join(p.dir, p.types)];
    paths[`${p.name}/*`] = [`${distDir}/*`];
  }
  return paths;
}

async function main() {
  const args = parseArgs(process.argv.slice(2), [
    "from-report",
    "skip-install",
  ]);

  const manifest = await requireManifest("tsx tools/registry-audit/extract.ts");
  let locals = await discoverWorkspacePackages();

  // Optional explicit redirects: --override <pkg>=<dir> (dir relative to repo root).
  for (const o of args.options.override ?? []) {
    const eq = o.indexOf("=");
    if (eq === -1) continue;
    const name = o.slice(0, eq);
    const dir = join(REPO_ROOT, o.slice(eq + 1));
    const pkg = JSON.parse(
      await readFile(join(dir, "package.json"), "utf8"),
    ) as PkgJson;
    const types = typesEntry(pkg) ?? "dist/index.d.ts";
    locals = locals.filter((l) => l.name !== name);
    locals.push({ name, dir, types });
  }
  const paths = buildPaths(locals);

  // Determine targets. Default: all extracted packages.
  let entries = Object.values(manifest.packages).filter((e) => e.tarballPath);
  const wantPackages = new Set(args.options.package ?? []);
  if (wantPackages.size) {
    entries = entries.filter((e) => wantPackages.has(e.name));
  } else if (args.flags["from-report"]) {
    const flagged = await loadReportFlagged();
    if (flagged) {
      entries = entries.filter((e) => flagged.has(e.name));
    } else {
      console.error(
        "--from-report given but no report.json found. Run analyze.ts first.",
      );
      process.exit(1);
    }
  }
  const limit = args.options.limit ? Number(opt(args, "limit")) : undefined;
  if (limit !== undefined) entries = entries.slice(0, limit);

  console.log(
    `Typechecking ${entries.length} package(s) against local builds ` +
      `(${locals.length} local redirect(s)).\n`,
  );

  const tsconfig = {
    compilerOptions: {
      module: "nodenext",
      moduleResolution: "nodenext",
      target: "es2022",
      strict: false,
      noEmit: true,
      skipLibCheck: false,
      types: [] as string[],
      jsx: "react-jsx",
      paths,
    },
    include: ["index.ts"],
  };

  type Result = {
    package: string;
    version: string;
    status: "ok" | "errors" | "install-failed";
    targetErrors: number;
    totalErrors: number;
    errorsFile?: string;
    sample: string[];
  };
  const results: Result[] = [];

  for (const entry of entries) {
    const dir = join(TYPECHECK_DIR, sanitize(entry.name));
    await mkdir(dir, { recursive: true });

    await writeFile(
      join(dir, "package.json"),
      JSON.stringify(
        {
          name: `audit-consumer-${sanitize(entry.name).replace(/[@/]/g, "")}`,
          private: true,
          type: "module",
          dependencies: { [entry.name]: `file:${entry.tarballPath}` },
        },
        null,
        2,
      ),
    );
    await writeFile(
      join(dir, "tsconfig.json"),
      JSON.stringify(tsconfig, null, 2),
    );
    // Scope the install's registry to this scaffold only (a project-local
    // .npmrc, read because pnpm runs with cwd: dir). The audit registry is a
    // Verdaccio proxy, so both the published internal packages (e.g. vetra-app)
    // and public deps resolve through it - without touching global npm config.
    await writeFile(
      join(dir, ".npmrc"),
      `registry=${manifest.registry.replace(/\/$/, "")}/\n`,
    );
    await writeFile(
      join(dir, "index.ts"),
      `import * as pkg from "${entry.name}";\nvoid (pkg as unknown);\n`,
    );

    if (!args.flags["skip-install"]) {
      console.log(`  install ${entry.name}@${entry.version} ...`);
      // --ignore-scripts avoids pnpm's unapproved-build-scripts gate (we only
      // need type declarations on disk, not native builds).
      const install = await runCapture(
        "pnpm",
        [
          "install",
          "--ignore-workspace",
          "--no-frozen-lockfile",
          "--ignore-scripts",
        ],
        { cwd: dir },
      );
      if (install.code !== 0) {
        await writeFile(
          join(dir, "install-error.txt"),
          install.stdout + install.stderr,
        );
        console.log(
          `  FAIL    ${entry.name}: pnpm install exited ${install.code}`,
        );
        results.push({
          package: entry.name,
          version: entry.version,
          status: "install-failed",
          targetErrors: 0,
          totalErrors: 0,
          errorsFile: relative(REPO_ROOT, join(dir, "install-error.txt")),
          sample: [
            (install.stderr || install.stdout).trim().split("\n").pop() ?? "",
          ],
        });
        continue;
      }
    }

    // The target must actually be installed for the typecheck to be meaningful
    // (relevant with --skip-install, or when a prior install failed).
    if (!(await exists(join(dir, "node_modules", entry.name)))) {
      console.log(
        `  FAIL    ${entry.name}: not installed (run without --skip-install)`,
      );
      results.push({
        package: entry.name,
        version: entry.version,
        status: "install-failed",
        targetErrors: 0,
        totalErrors: 0,
        sample: ["package not installed"],
      });
      continue;
    }

    const tsc = await runCapture(
      join(REPO_ROOT, "node_modules", ".bin", "tsc"),
      ["--noEmit", "-p", "tsconfig.json"],
      { cwd: dir },
    );
    const allErrors = (tsc.stdout + tsc.stderr)
      .split("\n")
      .filter((l) => /error TS\d+/.test(l));
    // Scope to the target package's own files; unrelated transitive-dependency
    // .d.ts noise (pglite, etc.) is recorded in tsc-errors.txt but not counted.
    const marker = `/node_modules/${entry.name}/`;
    const targetErrors = allErrors.filter((l) => l.includes(marker));
    const ok = targetErrors.length === 0;
    const errorsFile = relative(REPO_ROOT, join(dir, "tsc-errors.txt"));
    results.push({
      package: entry.name,
      version: entry.version,
      status: ok ? "ok" : "errors",
      targetErrors: targetErrors.length,
      totalErrors: allErrors.length,
      errorsFile,
      sample: targetErrors.slice(0, 5).map((l) => l.trim()),
    });

    await writeFile(
      join(dir, "tsc-errors.txt"),
      `# target errors: ${targetErrors.length}, total errors (incl. deps): ${allErrors.length}\n\n` +
        tsc.stdout +
        tsc.stderr,
    );

    if (ok) {
      console.log(`  ok      ${entry.name}`);
    } else {
      console.log(`  ERRORS  ${entry.name} (${targetErrors.length})`);
      for (const l of targetErrors.slice(0, 5)) {
        console.log(`            ${l.trim()}`);
      }
      if (targetErrors.length > 5) {
        console.log(`            ... see ${errorsFile}`);
      }
    }
  }

  // Consolidated report so "which packages are broken" lives in one place.
  await writeFile(
    TYPECHECK_REPORT_PATH,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        registry: manifest.registry,
        localRedirects: locals.map((l) => l.name).sort(),
        results: results.sort((a, b) => a.package.localeCompare(b.package)),
      },
      null,
      2,
    ),
  );

  const broken = results.filter((r) => r.status === "errors");
  const installFailed = results.filter((r) => r.status === "install-failed");
  const okCount = results.filter((r) => r.status === "ok").length;

  console.log(
    `\nDone. ok=${okCount} withErrors=${broken.length} installFailed=${installFailed.length}`,
  );
  if (broken.length) {
    console.log(`\nType errors in (target package's own files):`);
    for (const r of broken) {
      console.log(
        `  ${r.package}@${r.version}  (${r.targetErrors})  ${r.errorsFile}`,
      );
    }
  }
  if (installFailed.length) {
    console.log(`\nInstall failed (not type-checked):`);
    for (const r of installFailed) {
      console.log(
        `  ${r.package}@${r.version}  ${r.errorsFile ?? r.sample[0] ?? ""}`,
      );
    }
  }
  console.log(`\nFull report: ${relative(REPO_ROOT, TYPECHECK_REPORT_PATH)}`);
  if (broken.length || installFailed.length) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
