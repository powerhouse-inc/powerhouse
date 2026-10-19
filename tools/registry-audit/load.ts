/**
 * Phase 5: actually boot a Switchboard and import each published model.
 *
 * For every extracted package that exports `./document-models` or `./subgraphs`, this:
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
 *   --subgraphs-only   Audit ./subgraphs without booting Switchboard.
 *
 * Writes .cache/registry-audit/load-report.json and a console summary.
 * Requires a local Switchboard build unless --subgraphs-only is selected.
 */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  hasDocumentModelsExport,
  hasPackageExport,
  installScaffold,
  LOAD_DIR,
  LOAD_REPORT_PATH,
  opt,
  parseArgs,
  REPO_ROOT,
  REPORT_PATH,
  requireManifest,
  requireSwitchboardBuild,
  spawnWorker,
} from "./lib.js";
import type { SubgraphFinding } from "./subgraph-rule.js";

const RUNNER = join(REPO_ROOT, "tools", "registry-audit", "load-worker.ts");

type RunnerResult = {
  ok: boolean;
  ids: string[];
  error?: string;
  ms?: number;
  subgraphs?: SubgraphFinding[];
};

/**
 * Spawns the runner subprocess. `pkgName` undefined = baseline (no package);
 * `cwd` defaults to the repo root (used for the baseline).
 */
function runOnce(
  pkgName: string | undefined,
  cwd: string,
  timeoutMs: number,
  subgraphsOnly = false,
  hasSubgraphs = false,
) {
  return spawnWorker<RunnerResult>({
    runner: RUNNER,
    arg: pkgName ?? "none",
    cwd,
    timeoutMs,
    sentinel: "__SBLOAD__",
    env: {
      AUDIT_SUBGRAPHS_ONLY: subgraphsOnly ? "1" : "0",
      AUDIT_HAS_SUBGRAPHS: hasSubgraphs ? "1" : "0",
    },
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2), [
    "from-report",
    "skip-install",
    "subgraphs-only",
  ]);
  const filters = args.options.filter ?? [];
  const wantPackages = new Set(args.options.package ?? []);
  const timeoutMs = Number(opt(args, "timeout", "120000"));
  const skipInstall = args.flags["skip-install"] ?? false;

  const subgraphsOnly = args.flags["subgraphs-only"] ?? false;
  if (!subgraphsOnly) await requireSwitchboardBuild();

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

  const targets: typeof entries = [];
  for (const e of entries) {
    if (
      (await hasPackageExport(e.extractedPath!, "./subgraphs")) ||
      (!subgraphsOnly && (await hasDocumentModelsExport(e.extractedPath!)))
    )
      targets.push(e);
  }
  const limit = args.options.limit ? Number(opt(args, "limit")) : undefined;
  const finalTargets = limit !== undefined ? targets.slice(0, limit) : targets;

  console.log(
    subgraphsOnly
      ? `Auditing class subgraphs for ${finalTargets.length} package(s)...\n`
      : `Booting Switchboard for ${finalTargets.length} package(s) (schema build on)...\n`,
  );

  // Baseline: which document-model ids exist with no external package loaded.
  if (!subgraphsOnly) console.log("  baseline (no package) ...");
  const baseline = subgraphsOnly
    ? undefined
    : await runOnce(undefined, REPO_ROOT, timeoutMs);
  const baselineIds = new Set(baseline?.result?.ids ?? []);
  if (!subgraphsOnly)
    console.log(`  baseline: ${baselineIds.size} core model(s)\n`);

  type Outcome = {
    package: string;
    version: string;
    status:
      | "audited-subgraphs"
      | "loaded"
      | "no-models"
      | "boot-failed"
      | "install-failed"
      | "timeout";
    loadedModels: string[];
    subgraphs?: SubgraphFinding[];
    ms?: number;
    error?: string;
  };
  const results: Outcome[] = [];

  for (const entry of finalTargets) {
    const scaffold = await installScaffold({
      name: entry.name,
      tarballPath: entry.tarballPath!,
      baseDir: LOAD_DIR,
      namePrefix: "audit-load",
      skipInstall,
    });
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

    const run = await runOnce(
      entry.name,
      scaffold.dir,
      timeoutMs,
      subgraphsOnly,
      await hasPackageExport(entry.extractedPath!, "./subgraphs"),
    );
    let status: Outcome["status"];
    let loadedModels: string[] = [];
    let error: string | undefined;

    if (run.timedOut) {
      status = "timeout";
      error = `killed after ${timeoutMs}ms`;
    } else if (run.result?.ok) {
      loadedModels = run.result.ids.filter((id) => !baselineIds.has(id));
      status = subgraphsOnly
        ? "audited-subgraphs"
        : loadedModels.length
          ? "loaded"
          : "no-models";
    } else {
      status = "boot-failed";
      error = run.result?.error ?? `exit ${run.exitCode}\n${run.rawTail}`;
    }

    results.push({
      package: entry.name,
      version: entry.version,
      status,
      loadedModels,
      subgraphs: run.result?.subgraphs,
      ms: run.result?.ms,
      error,
    });

    const label =
      status === "audited-subgraphs"
        ? `AUDITED ${entry.name}`
        : status === "loaded"
          ? `ok      ${entry.name}  → ${loadedModels.join(", ")}`
          : status === "no-models"
            ? `WARN    ${entry.name}  (booted, registered no models)`
            : status === "timeout"
              ? `TIMEOUT ${entry.name}`
              : `FAILED  ${entry.name}`;
    console.log(`  ${label}`);
    for (const finding of run.result?.subgraphs ?? []) {
      console.log(
        `            [${finding.classification}] ${finding.exports.join(", ")}: ${finding.evidence}`,
      );
    }
    if (status === "boot-failed" && error) {
      console.log(`            ${error.split("\n")[0].slice(0, 200)}`);
    }
  }

  const findings = results.flatMap((r) => r.subgraphs ?? []);
  const classified = (classification: SubgraphFinding["classification"]) =>
    findings.filter((f) => f.classification === classification).length;

  await writeFile(
    LOAD_REPORT_PATH,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        registry: manifest.registry,
        subgraphsOnly,
        selection: {
          packages: [...wantPackages],
          filters,
          fromReport: args.flags["from-report"] ?? false,
          limit,
          manifestPackages: Object.keys(manifest.packages).length,
          selectedPackages: entries.length,
          eligiblePackages: targets.length,
          processedPackages: results.length,
        },
        skippedPackages: entries
          .filter((entry) => !targets.includes(entry))
          .map((entry) => entry.name),
        subgraphSummary: {
          newStyle: classified("new-style"),
          oldStyle: classified("old-style"),
          namelessOther: classified("nameless/other"),
          unresolved: findings.filter(
            (f) => f.constructionRequired && !f.constructed,
          ).length,
        },
        baselineModels: [...baselineIds].sort(),
        results: results.sort((a, b) => a.package.localeCompare(b.package)),
      },
      null,
      2,
    ),
  );

  const audited = results.filter((r) => r.status === "audited-subgraphs");
  const loaded = results.filter((r) => r.status === "loaded");
  const noModels = results.filter((r) => r.status === "no-models");
  const failed = results.filter(
    (r) => r.status === "boot-failed" || r.status === "timeout",
  );
  const installFailed = results.filter((r) => r.status === "install-failed");

  console.log(
    `\nDone. auditedSubgraphs=${audited.length} loaded=${loaded.length} noModels=${noModels.length} ` +
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
