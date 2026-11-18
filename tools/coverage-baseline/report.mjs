import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { promisify } from "node:util";
import {
  copyFileSync,
  existsSync,
  linkSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { escape } from "glob";
import libCoverage from "istanbul-lib-coverage";
import libReport from "istanbul-lib-report";
import reports from "istanbul-reports";
import { CoverageReport } from "monocart-coverage-reports";
import { monocartOptions } from "./config.mjs";
import { bunSourceBase } from "./results.mjs";
import {
  layer,
  readLines,
  totals,
  totalsByOwner,
  writeLines,
} from "./lines.mjs";

const exec = promisify(execFile);
const command = async (args, cwd) =>
  (
    await exec(args[0], args.slice(1), {
      cwd,
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
    })
  ).stdout;

export async function externalReport(job) {
  const dataDir = join(job.out, "node");
  const filtered = join(job.out, "application-node");
  mkdirSync(filtered, { recursive: true });
  let nodeRecords = 0;
  const rejectedNodeRecords = [];
  for (const name of existsSync(dataDir)
    ? readdirSync(dataDir).filter((name) => name.endsWith(".json"))
    : []) {
    const input = readFileSync(join(dataDir, name));
    let data;
    try {
      data = JSON.parse(input.toString("utf8"));
      if (
        !Array.isArray(data?.result) ||
        data.result.some(
          (entry) =>
            typeof entry?.url !== "string" || !Array.isArray(entry.functions),
        )
      )
        throw new Error("Expected native V8 result entries");
    } catch (error) {
      rejectedNodeRecords.push({
        file: `node/${name}`,
        bytes: input.length,
        sha256: createHash("sha256").update(input).digest("hex"),
        reason: error.message,
      });
      continue;
    }
    // Vitest reports its transformed modules itself; only external application isolates belong here.
    if (
      data.result.some((entry) =>
        /\/node_modules\/(?:\.pnpm\/[^/]+\/node_modules\/)?vitest\/dist\//.test(
          entry.url,
        ),
      )
    )
      continue;
    linkSync(join(dataDir, name), join(filtered, name));
    nodeRecords++;
  }
  const browserDir = join(job.out, "browser");
  let browserRecords = 0;
  const rawDirs = [],
    browserErrors = [],
    mappingErrors = [],
    workerKinds = new Set(),
    testIds = new Set();
  for (const name of existsSync(browserDir)
    ? readdirSync(browserDir).filter((name) => name.endsWith(".json"))
    : []) {
    const record = JSON.parse(readFileSync(join(browserDir, name), "utf8"));
    browserRecords++;
    for (const id of record.testIds ?? []) testIds.add(id);
    for (const kind of record.kinds ?? [])
      if (["worker", "shared_worker", "service_worker"].includes(kind))
        workerKinds.add(kind);
    browserErrors.push(...(record.errors ?? []));
    if (record.mappingErrors?.length) {
      browserErrors.push(...record.mappingErrors);
      continue;
    }
    // The collector never adds a target whose export could inflate hits, so errors here are gaps.
    if (record.rawDir && existsSync(record.rawDir)) rawDirs.push(record.rawDir);
    else if (record.kinds?.length)
      browserErrors.push(`Missing browser raw export: ${name}`);
  }
  const mcr = new CoverageReport({
    ...monocartOptions(
      job.root,
      join(job.out, "external"),
      job.sources,
      mappingErrors,
    ),
    ...(rawDirs.length ? { inputDir: rawDirs } : {}),
  });
  if (nodeRecords) await mcr.addFromDir(filtered);
  if (nodeRecords || browserRecords) await mcr.generate();
  if (mappingErrors.length) throw new Error(mappingErrors.join("; "));
  return {
    valid: true,
    nodeRecords,
    rejectedNodeRecords,
    browserRecords,
    browserErrors,
    browserWorkerKinds: [...workerKinds].sort(),
    browserTestIds: [...testIds],
    report: existsSync(join(job.out, "external/lcov.info"))
      ? join(job.out, "external/lcov.info")
      : null,
  };
}

const lineCounts = new Map();
function lineCount(path) {
  if (!lineCounts.has(path)) {
    const text = readFileSync(path, "utf8");
    lineCounts.set(
      path,
      text.split("\n").length - (text.endsWith("\n") ? 1 : 0),
    );
  }
  return lineCounts.get(path);
}

// Lines are the shared metric; converters can report a line past the end of a file.
export function canonicalLcov(
  input,
  base,
  root,
  selected,
  output,
  sourceRoot = root,
) {
  const blocks = readFileSync(input, "utf8").split("end_of_record");
  const kept = [];
  for (const block of blocks) {
    const match = block.match(/^SF:(.+)$/m);
    if (!match) continue;
    const file = relative(root, resolve(base, match[1])).replaceAll("\\", "/");
    if (!selected.has(file)) continue;
    const last = lineCount(resolve(sourceRoot, file));
    const lines = block
      .split("\n")
      .filter((line) => line.startsWith("DA:"))
      .filter((line) => Number(line.slice(3).split(",")[0]) <= last);
    kept.push(`SF:${file}\n${lines.join("\n")}\nend_of_record\n`);
  }
  writeFileSync(output, kept.join(""));
  return kept.length;
}

// Vitest's own converter fixes every file's line set, so Vitest hits keep their lines.
// Imports stay unresolved: each file is transformed alone and never executed.
export async function untouchedSeed(root, sources, dir) {
  mkdirSync(dir, { recursive: true });
  // Paths are matched as globs; escape names such as `[id].tsx` or `{-$slug}.tsx`.
  writeFileSync(
    join(dir, "sources.json"),
    JSON.stringify(sources.map((source) => escape(source))),
  );
  const config = join(dir, "seed.config.mjs");
  writeFileSync(
    config,
    `import { readFileSync } from "node:fs";
export default {
  oxc: { jsx: { runtime: "automatic" } },
  plugins: [{ name: "coverage-seed-external", enforce: "pre", resolveId: (id, importer) => (importer ? { id, external: true } : null) }],
  test: {
    root: ${JSON.stringify(root)},
    include: [${JSON.stringify(join(dir, "no-tests", "*.test.mjs"))}],
    passWithNoTests: true,
    watch: false,
    coverage: {
      enabled: true,
      provider: "v8",
      include: JSON.parse(readFileSync(${JSON.stringify(join(dir, "sources.json"))}, "utf8")),
      exclude: [],
      allowExternal: true,
      reportsDirectory: ${JSON.stringify(join(dir, "vitest"))},
      reporter: [["lcovonly", { projectRoot: ${JSON.stringify(root)} }]],
    },
  },
};
`,
  );
  const vitest = join(
    dirname(createRequire(import.meta.url).resolve("vitest/package.json")),
    "vitest.mjs",
  );
  let log;
  try {
    log = await command(
      [process.execPath, vitest, "run", `--config=${config}`],
      root,
    );
  } catch (error) {
    writeFileSync(join(dir, "seed.log"), `${error.stdout}\n${error.stderr}`);
    throw new Error(`Vitest could not seed untouched source; see ${dir}`, {
      cause: error,
    });
  }
  writeFileSync(join(dir, "seed.log"), log);
  const lcov = join(dir, "vitest", "lcov.info");
  const seeded = new Set(
    existsSync(lcov)
      ? [...readFileSync(lcov, "utf8").matchAll(/^SF:(.+)$/gm)].map((match) =>
          relative(root, resolve(root, match[1])).replaceAll("\\", "/"),
        )
      : [],
  );
  const missing = sources.filter((source) => !seeded.has(source));
  if (missing.length)
    throw new Error(
      `Vitest could not convert ${missing.length} source files: ${missing.slice(0, 10).join(", ")}`,
    );
  return lcov;
}

// Each counted line becomes one statement, so istanbul's nested HTML shows line coverage per directory and file.
function writeHtml(files, root, dir) {
  const map = libCoverage.createCoverageMap({});
  for (const [file, lines] of files) {
    const path = resolve(root, file);
    const text = readFileSync(path, "utf8").split("\n");
    const statementMap = {},
      s = {};
    for (const [index, line] of [...lines.keys()]
      .sort((a, b) => a - b)
      .entries()) {
      statementMap[index] = {
        start: { line, column: 0 },
        end: { line, column: Math.max(1, text[line - 1]?.length ?? 1) },
      };
      s[index] = lines.get(line);
    }
    map.addFileCoverage({
      path,
      statementMap,
      fnMap: {},
      branchMap: {},
      s,
      f: {},
      b: {},
    });
  }
  const context = libReport.createContext({
    dir,
    coverageMap: map,
    defaultSummarizer: "nested",
  });
  reports.create("html", { skipEmpty: false }).execute(context);
}

export async function renderReports(root, out, sources, jobs) {
  const baseline = await untouchedSeed(root, sources, join(out, "untouched"));
  const selected = new Set(sources);
  const canonical = join(out, "lcov");
  mkdirSync(canonical, { recursive: true });
  const empty = join(canonical, "untouched.info");
  canonicalLcov(baseline, root, root, selected, empty);
  const tierInputs = { unit: [empty], integration: [empty], e2e: [empty] };
  for (const [i, job] of jobs.entries()) {
    if (job.withholdCoverage) continue;
    if (job.scenario?.changedProductSource?.length) continue;
    const executionRoot = job.root ?? root;
    for (const [name, defaultBase] of [
      ["vitest/lcov.info", executionRoot],
      ["external/lcov.info", executionRoot],
      ["bun/lcov.info", job.cwd],
    ]) {
      if (name === "external/lcov.info" && job.collection?.valid === false)
        continue;
      const input = join(job.out, name);
      if (!existsSync(input)) continue;
      let base = defaultBase;
      if (name === "bun/lcov.info") {
        try {
          base = bunSourceBase(job);
        } catch {
          continue;
        }
      }
      const target = join(canonical, `${i}-${name.split("/")[0]}.info`);
      if (canonicalLcov(input, base, executionRoot, selected, target, root))
        tierInputs[job.tier].push(target);
    }
  }
  const complete =
    existsSync(join(out, "run.json")) &&
    JSON.parse(readFileSync(join(out, "run.json"), "utf8")).complete === true;
  const status = complete
    ? "Complete observed coverage"
    : "PARTIAL observed coverage";
  const reportDir = join(out, "report");
  mkdirSync(reportDir, { recursive: true });
  const seed = readLines(empty);
  const collected = ["unit", "integration", "e2e"].filter((tier) =>
    jobs.some((job) => job.tier === tier),
  );
  const summary = {};
  for (const tier of [...collected, "combined"]) {
    const inputs =
      tier === "combined"
        ? collected.flatMap((name) => tierInputs[name])
        : tierInputs[tier];
    const lines = layer(seed, [...new Set(inputs)].map(readLines));
    writeLines(lines, join(canonical, `${tier}.info`));
    const total = totals(lines);
    summary[tier] = { ...total, owners: totalsByOwner(lines) };
    writeFileSync(
      join(out, `${tier}-summary.txt`),
      `${tier} lines: ${total.percent.toFixed(1)}% (${total.hit} of ${total.found})\n`,
    );
    writeHtml(lines, root, join(reportDir, tier));
  }
  writeFileSync(join(out, "summary.json"), JSON.stringify(summary, null, 2));
  copyFileSync(
    new URL("./README.md", import.meta.url),
    join(reportDir, "README.md"),
  );
  const labels = [...new Set(jobs.flatMap((job) => job.labels ?? []))].sort();
  writeFileSync(
    join(reportDir, "index.html"),
    `<!doctype html><html><head><meta charset="utf-8"><title>Test coverage baseline</title></head><body><h1>${status}</h1><p>Conventional line coverage for tracked JavaScript and TypeScript. Open a layer, then drill into packages, apps and source files.</p><ul>${["combined", ...collected].map((tier) => `<li><a href="${tier}/index.html">${tier}</a></li>`).join("")}</ul><p>Declared purpose labels: ${labels.length ? labels.join(", ") : "none recorded"}. Labels have no separate coverage percentage and do not prove case execution. File classifications and their basis are in run.json.</p><p><a href="README.md">Test levels, labels and separate checks</a> lists existing checks that this workflow does not execute.</p><p>Read <a href="../run.json">run.json</a> for command outcomes, missing collection, source identity and tool versions. Failed or incomplete suites make this an observed, partial baseline.</p></body></html>`,
  );
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const [mode, file] = process.argv.slice(2);
  const data = JSON.parse(readFileSync(file, "utf8"));
  if (mode === "external") {
    try {
      const collection = await externalReport({
        ...data,
        sources: JSON.parse(readFileSync(data.sourceFile, "utf8")),
      });
      writeFileSync(
        join(data.out, "collection.json"),
        JSON.stringify(collection, null, 2),
      );
    } catch (error) {
      writeFileSync(
        join(data.out, "collection.json"),
        JSON.stringify({ valid: false, error: String(error.stack ?? error) }),
      );
      throw error;
    }
  } else if (mode === "render") {
    await renderReports(
      data.root,
      dirname(file),
      Object.keys(data.sourceHashes).sort(),
      data.jobs,
    );
  } else throw new Error("Expected external <job.json> or render <run.json>");
}
