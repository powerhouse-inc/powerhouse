/**
 * Phase 6: boot a Switchboard, then for every document model a published package
 * contributes, create a document of that type and query it back - through the
 * model's OWN generated GraphQL subgraph endpoint (/graphql/<kebab-name>).
 *
 * This is the deepest runtime check in the suite. Where `load` only proves a
 * model boots and registers, this proves its generated schema + resolvers
 * actually function against the current core: an empty document can be created
 * and read back via the per-model API.
 *
 * For each target package this:
 *   1. reuses (or creates) the install scaffold under .cache/registry-audit/load/
 *      <pkg>/ that the `load` phase also uses - so a single install serves both
 *      phases, and
 *   2. spawns an isolated worker (create-query-worker.ts) with cwd set to that
 *      scaffold, which boots a Switchboard in-process (in-memory PGlite), loads
 *      that one package, and exercises each contributed model over HTTP.
 *
 * Usage:
 *   tsx tools/registry-audit/create-query.ts [options]
 *
 * Options:
 *   --package <name>   Only run this package (repeatable).
 *   --from-report      Only run packages flagged in report.json.
 *   --filter <substr>  Only run packages whose name includes <substr> (repeatable).
 *   --limit <n>        Process at most n packages.
 *   --timeout <ms>     Per-package boot+exercise timeout (default 120000).
 *   --reinstall        Force a fresh install even if a scaffold already exists.
 *
 * Writes .cache/registry-audit/create-query-report.json and a console summary.
 * Requires the local Switchboard to be built (apps/switchboard/dist/server.mjs).
 */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  CREATE_QUERY_REPORT_PATH,
  hasDocumentModelsExport,
  installScaffold,
  LOAD_DIR,
  opt,
  parseArgs,
  REPO_ROOT,
  REPORT_PATH,
  requireManifest,
  requireSwitchboardBuild,
  spawnWorker,
} from "./lib.js";

const CQ_RUNNER = join(
  REPO_ROOT,
  "tools",
  "registry-audit",
  "create-query-worker.ts",
);
const LOAD_RUNNER = join(
  REPO_ROOT,
  "tools",
  "registry-audit",
  "load-worker.ts",
);

type ModelResult = {
  id: string;
  name: string;
  subgraph: string;
  created: boolean;
  queried: boolean;
  endpointMissing?: boolean;
  createError?: string;
  queryError?: string;
};
type CqResult = {
  ok: boolean;
  models: ModelResult[];
  ms?: number;
  error?: string;
};
type LoadResult = { ok: boolean; ids: string[]; error?: string };

async function main() {
  const args = parseArgs(process.argv.slice(2), ["from-report", "reinstall"]);
  const filters = args.options.filter ?? [];
  const wantPackages = new Set(args.options.package ?? []);
  const timeoutMs = Number(opt(args, "timeout", "120000"));
  // Reuse the load phase's installs by default; the tarball is immutable per version.
  const skipInstall = !args.flags["reinstall"];

  await requireSwitchboardBuild();

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

  // Only packages that actually expose document models are exercisable.
  const targets: typeof entries = [];
  for (const e of entries) {
    if (await hasDocumentModelsExport(e.extractedPath!)) targets.push(e);
  }
  const limit = args.options.limit ? Number(opt(args, "limit")) : undefined;
  const finalTargets = limit !== undefined ? targets.slice(0, limit) : targets;

  console.log(
    `Create+query for ${finalTargets.length} model package(s) ` +
      `(per-model generated subgraph endpoints)...\n`,
  );

  // Baseline: the core model ids present with no external package loaded, so we
  // exercise only each package's OWN models. Reuses the load worker.
  console.log("  baseline (no package) ...");
  const baseline = await spawnWorker<LoadResult>({
    runner: LOAD_RUNNER,
    arg: "none",
    cwd: REPO_ROOT,
    timeoutMs,
    sentinel: "__SBLOAD__",
  });
  const baselineIds = baseline.result?.ids ?? [];
  console.log(`  baseline: ${baselineIds.length} core model(s)\n`);

  type Outcome = {
    package: string;
    version: string;
    status:
      | "ok"
      | "partial"
      | "failed"
      | "no-models"
      | "boot-failed"
      | "install-failed"
      | "timeout";
    models: ModelResult[];
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
        models: [],
        error: scaffold.error,
      });
      console.log(
        `  INSTALL-FAIL ${entry.name}: ${scaffold.error.slice(0, 120)}`,
      );
      continue;
    }

    const run = await spawnWorker<CqResult>({
      runner: CQ_RUNNER,
      arg: entry.name,
      cwd: scaffold.dir,
      timeoutMs,
      sentinel: "__SBCQ__",
      env: { PH_BASELINE_MODEL_IDS: JSON.stringify(baselineIds) },
    });

    let status: Outcome["status"];
    let models: ModelResult[] = [];
    let error: string | undefined;

    if (run.timedOut) {
      status = "timeout";
      error = `killed after ${timeoutMs}ms`;
    } else if (run.result?.ok) {
      models = run.result.models;
      const full = models.filter((m) => m.created && m.queried).length;
      if (models.length === 0) status = "no-models";
      else if (full === models.length) status = "ok";
      else if (full === 0) status = "failed";
      else status = "partial";
    } else {
      status = "boot-failed";
      error = run.result?.error ?? `exit ${run.exitCode}\n${run.rawTail}`;
    }

    results.push({
      package: entry.name,
      version: entry.version,
      status,
      models,
      ms: run.result?.ms,
      error,
    });

    const ok = models.filter((m) => m.created && m.queried).length;
    const label =
      status === "ok"
        ? `ok      ${entry.name}  (${ok}/${models.length} models)`
        : status === "partial"
          ? `PARTIAL ${entry.name}  (${ok}/${models.length} models)`
          : status === "failed"
            ? `FAILED  ${entry.name}  (0/${models.length} models)`
            : status === "no-models"
              ? `WARN    ${entry.name}  (booted, no own models)`
              : status === "timeout"
                ? `TIMEOUT ${entry.name}`
                : `BOOT-FAIL ${entry.name}`;
    console.log(`  ${label}`);
    for (const m of models.filter((m) => !(m.created && m.queried))) {
      const why = m.createError ?? m.queryError ?? "unknown";
      console.log(`            ${m.id}: ${why.split("\n")[0].slice(0, 160)}`);
    }
    if (status === "boot-failed" && error) {
      console.log(`            ${error.split("\n")[0].slice(0, 200)}`);
    }
  }

  await writeFile(
    CREATE_QUERY_REPORT_PATH,
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

  const okCount = results.filter((r) => r.status === "ok").length;
  const partial = results.filter((r) => r.status === "partial");
  const failed = results.filter((r) => r.status === "failed");
  const noModels = results.filter((r) => r.status === "no-models");
  const bootFailed = results.filter(
    (r) => r.status === "boot-failed" || r.status === "timeout",
  );
  const installFailed = results.filter((r) => r.status === "install-failed");

  console.log(
    `\nDone. ok=${okCount} partial=${partial.length} failed=${failed.length} ` +
      `noModels=${noModels.length} bootFailed=${bootFailed.length} ` +
      `installFailed=${installFailed.length}`,
  );
  const problems = [...partial, ...failed, ...bootFailed];
  if (problems.length) {
    console.log(`\nModels that did not create+query cleanly:`);
    for (const r of problems) {
      console.log(`  ${r.package}@${r.version}  [${r.status}]`);
      if (r.error) console.log(`      ${r.error.split("\n")[0].slice(0, 200)}`);
      for (const m of r.models.filter((m) => !(m.created && m.queried))) {
        const why = m.createError ?? m.queryError ?? "unknown";
        console.log(`      ${m.id}: ${why.split("\n")[0].slice(0, 160)}`);
      }
    }
  }
  console.log(`\nFull report: ${CREATE_QUERY_REPORT_PATH}`);
  if (problems.length) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
