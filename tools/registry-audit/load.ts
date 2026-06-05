/**
 * Phase 5: actually boot a Switchboard and import each published model.
 *
 * For every extracted package that exports `./document-models`, this:
 *   1. installs the published tarball into a clean scaffold under
 *      .cache/registry-audit/load/<pkg>/ (pnpm, --ignore-scripts), so the
 *      package's full dependency graph resolves the way it would in a real
 *      deployment, and
 *   2. spawns an isolated worker (load-worker.ts) with cwd set to that
 *      scaffold, which starts a real Switchboard in-process (in-memory PGlite,
 *      no external services), loads that one package, and builds its GraphQL
 *      subgraph schema.
 *
 * This answers what the static phases cannot: *does the current Switchboard
 * successfully import this published package and build its schema?* The
 * Switchboard / reactor-api doing the schema assembly is the LOCAL build, so a
 * stale SDL (e.g. `scalar Attachment`) is exercised against the current core.
 *
 * (The package is imported as-published, with its own pinned deps — we install
 * rather than load from the cache dir because published build outputs vary
 * wildly: some bundle their deps, some externalise `document-model`, some even
 * pull in test-only imports. A real install is the only uniformly reliable way
 * to resolve them.)
 *
 * Usage:
 *   tsx tools/registry-audit/load.ts [options]
 *
 * Options:
 *   --package <name>   Only load this package (repeatable).
 *   --from-report      Only load packages flagged in report.json.
 *   --filter <substr>  Only load packages whose name includes <substr> (repeatable).
 *   --limit <n>        Process at most n packages.
 *   --timeout <ms>     Per-package boot timeout (default 120000).
 *   --skip-install     Reuse a prior install in each scaffold.
 *
 * Writes .cache/registry-audit/load-report.json and a console summary.
 * Requires the local Switchboard to be built (apps/switchboard/dist/server.mjs).
 */
import { spawn } from "node:child_process";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  CACHE_DIR,
  opt,
  parseArgs,
  REPO_ROOT,
  REPORT_PATH,
  requireManifest,
  runCapture,
  sanitize,
} from "./lib.js";

const LOAD_DIR = join(CACHE_DIR, "load");
const LOAD_REPORT_PATH = join(CACHE_DIR, "load-report.json");
const RUNNER = join(REPO_ROOT, "tools", "registry-audit", "load-worker.ts");
const TSX = join(REPO_ROOT, "node_modules", ".bin", "tsx");
const SWITCHBOARD = join(
  REPO_ROOT,
  "apps",
  "switchboard",
  "dist",
  "server.mjs",
);

type RunnerResult = { ok: boolean; ids: string[]; error?: string; ms?: number };

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/** True if the extracted package declares a `./document-models` export. */
async function hasDocumentModelsExport(
  extractedPath: string,
): Promise<boolean> {
  try {
    const pkg = JSON.parse(
      await readFile(join(extractedPath, "package.json"), "utf8"),
    ) as { exports?: Record<string, unknown> };
    return Boolean(pkg.exports?.["./document-models"]);
  } catch {
    return false;
  }
}

type RunOutcome = {
  exitCode: number | null;
  result: RunnerResult | null;
  rawTail: string;
  timedOut: boolean;
};

/**
 * Spawns the runner subprocess. `pkgName` undefined = baseline (no package);
 * `cwd` defaults to the repo root (used for the baseline).
 */
function runOnce(
  pkgName: string | undefined,
  cwd: string,
  timeoutMs: number,
): Promise<RunOutcome> {
  return new Promise((resolvePromise) => {
    const child = spawn(TSX, [RUNNER, pkgName ?? "none"], {
      cwd,
      env: { ...process.env, PH_PGLITE_IN_MEMORY: "1" },
    });
    let out = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);

    const collect = (d: Buffer) => (out += d.toString());
    child.stdout.on("data", collect);
    child.stderr.on("data", collect);
    child.on("close", (exitCode) => {
      clearTimeout(timer);
      const line = out.split("\n").find((l) => l.startsWith("__SBLOAD__ "));
      let result: RunnerResult | null = null;
      if (line) {
        try {
          result = JSON.parse(line.slice("__SBLOAD__ ".length)) as RunnerResult;
        } catch {
          /* leave null */
        }
      }
      resolvePromise({
        exitCode,
        result,
        rawTail: out.split("\n").slice(-25).join("\n"),
        timedOut,
      });
    });
  });
}

/** Installs the published tarball into a clean scaffold; returns its dir or null. */
async function installScaffold(
  name: string,
  tarballPath: string,
  skipInstall: boolean,
): Promise<{ dir: string } | { error: string }> {
  const dir = join(LOAD_DIR, sanitize(name));
  await mkdir(dir, { recursive: true });
  // Deliberately no tsconfig.json here: a tsconfig with `paths` would make tsx
  // mis-resolve the Switchboard's own deps when running with cwd=scaffold.
  await writeFile(
    join(dir, "package.json"),
    JSON.stringify(
      {
        name: `audit-load-${sanitize(name).replace(/[@/]/g, "")}`,
        private: true,
        type: "module",
        dependencies: { [name]: `file:${tarballPath}` },
      },
      null,
      2,
    ),
  );
  if (skipInstall && (await exists(join(dir, "node_modules", name)))) {
    return { dir };
  }
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
    return {
      error:
        (install.stderr || install.stdout).trim().split("\n").pop() ??
        `pnpm install exited ${install.code}`,
    };
  }
  return { dir };
}

async function main() {
  const args = parseArgs(process.argv.slice(2), [
    "from-report",
    "skip-install",
  ]);
  const filters = args.options.filter ?? [];
  const wantPackages = new Set(args.options.package ?? []);
  const timeoutMs = Number(opt(args, "timeout", "120000"));
  const skipInstall = args.flags["skip-install"] ?? false;

  if (!(await exists(SWITCHBOARD))) {
    console.error(
      `Switchboard build not found at ${SWITCHBOARD}.\n` +
        `Build it first:  pnpm --filter=@powerhousedao/switchboard build`,
    );
    process.exit(1);
  }

  const manifest = await requireManifest("tsx tools/registry-audit/extract.ts");
  let entries = Object.values(manifest.packages).filter(
    (e) => e.extractedPath && e.tarballPath,
  );

  if (wantPackages.size) {
    entries = entries.filter((e) => wantPackages.has(e.name));
  } else if (args.flags["from-report"]) {
    try {
      const report = JSON.parse(await readFile(REPORT_PATH, "utf8")) as {
        findings: { package: string }[];
      };
      const flagged = new Set(report.findings.map((f) => f.package));
      entries = entries.filter((e) => flagged.has(e.name));
    } catch {
      console.error(
        "--from-report given but no report.json found. Run analyze.ts first.",
      );
      process.exit(1);
    }
  }
  if (filters.length) {
    entries = entries.filter((e) => filters.some((f) => e.name.includes(f)));
  }

  // Only packages that actually expose document models are loadable.
  const targets: typeof entries = [];
  for (const e of entries) {
    if (await hasDocumentModelsExport(e.extractedPath!)) targets.push(e);
  }
  const limit = args.options.limit ? Number(opt(args, "limit")) : undefined;
  const finalTargets = limit !== undefined ? targets.slice(0, limit) : targets;

  console.log(
    `Booting Switchboard for ${finalTargets.length} model package(s) ` +
      `(install + in-memory boot, schema build on)...\n`,
  );

  // Baseline: which document-model ids exist with no external package loaded.
  console.log("  baseline (no package) ...");
  const baseline = await runOnce(undefined, REPO_ROOT, timeoutMs);
  const baselineIds = new Set(baseline.result?.ids ?? []);
  console.log(`  baseline: ${baselineIds.size} core model(s)\n`);

  type Outcome = {
    package: string;
    version: string;
    status:
      | "loaded"
      | "no-models"
      | "boot-failed"
      | "install-failed"
      | "timeout";
    loadedModels: string[];
    ms?: number;
    error?: string;
  };
  const results: Outcome[] = [];

  for (const entry of finalTargets) {
    const scaffold = await installScaffold(
      entry.name,
      entry.tarballPath!,
      skipInstall,
    );
    if ("error" in scaffold) {
      results.push({
        package: entry.name,
        version: entry.version,
        status: "install-failed",
        loadedModels: [],
        error: scaffold.error,
      });
      console.log(
        `  INSTALL-FAIL ${entry.name}: ${scaffold.error.slice(0, 120)}`,
      );
      continue;
    }

    const run = await runOnce(entry.name, scaffold.dir, timeoutMs);
    let status: Outcome["status"];
    let loadedModels: string[] = [];
    let error: string | undefined;

    if (run.timedOut) {
      status = "timeout";
      error = `killed after ${timeoutMs}ms`;
    } else if (run.result?.ok) {
      loadedModels = run.result.ids.filter((id) => !baselineIds.has(id));
      status = loadedModels.length ? "loaded" : "no-models";
    } else {
      status = "boot-failed";
      error = run.result?.error ?? `exit ${run.exitCode}\n${run.rawTail}`;
    }

    results.push({
      package: entry.name,
      version: entry.version,
      status,
      loadedModels,
      ms: run.result?.ms,
      error,
    });

    const label =
      status === "loaded"
        ? `ok      ${entry.name}  → ${loadedModels.join(", ")}`
        : status === "no-models"
          ? `WARN    ${entry.name}  (booted, registered no models)`
          : status === "timeout"
            ? `TIMEOUT ${entry.name}`
            : `FAILED  ${entry.name}`;
    console.log(`  ${label}`);
    if (status === "boot-failed" && error) {
      console.log(`            ${error.split("\n")[0].slice(0, 200)}`);
    }
  }

  await writeFile(
    LOAD_REPORT_PATH,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        registry: manifest.registry,
        baselineModels: [...baselineIds].sort(),
        results: results.sort((a, b) => a.package.localeCompare(b.package)),
      },
      null,
      2,
    ),
  );

  const loaded = results.filter((r) => r.status === "loaded");
  const noModels = results.filter((r) => r.status === "no-models");
  const failed = results.filter(
    (r) => r.status === "boot-failed" || r.status === "timeout",
  );
  const installFailed = results.filter((r) => r.status === "install-failed");

  console.log(
    `\nDone. loaded=${loaded.length} noModels=${noModels.length} ` +
      `bootFailed=${failed.length} installFailed=${installFailed.length}`,
  );
  if (failed.length) {
    console.log(`\nBooted the Switchboard but failed (worth investigating):`);
    for (const r of failed) {
      console.log(`  ${r.package}@${r.version}  [${r.status}]`);
      if (r.error) console.log(`      ${r.error.split("\n")[0].slice(0, 200)}`);
    }
  }
  if (noModels.length) {
    console.log(
      `\nBooted but registered no models (often unrelated packaging issues):`,
    );
    for (const r of noModels) console.log(`  ${r.package}@${r.version}`);
  }
  console.log(`\nFull report: ${LOAD_REPORT_PATH}`);
  if (failed.length) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
