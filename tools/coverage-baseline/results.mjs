import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { sourceFiles } from "./config.mjs";

const read = (path) => JSON.parse(readFileSync(path, "utf8"));

export function bunSourceBase(job) {
  const { cwd } = read(join(job.out, "bun/origin.json"));
  const local = typeof cwd === "string" && relative(job.root, cwd);
  if (
    typeof cwd !== "string" ||
    !isAbsolute(cwd) ||
    local === ".." ||
    local.startsWith(".." + sep) ||
    isAbsolute(local)
  )
    throw new Error("Bun coverage origin is outside the executed checkout");
  return cwd;
}

export function isComplete(jobs) {
  return (
    jobs.length > 0 &&
    jobs.some(
      (job) => (job.outcomes?.passed ?? 0) + (job.outcomes?.failed ?? 0) > 0,
    ) &&
    jobs.every((job) => Array.isArray(job.gaps) && job.gaps.length === 0)
  );
}

export function verifySourceIdentity(root, sources, hashes) {
  const current = sourceFiles(root);
  if (JSON.stringify(current) !== JSON.stringify([...sources].sort()))
    throw new Error("Selected source set changed since collection");
  const changed = sources.filter(
    (path) =>
      !existsSync(resolve(root, path)) ||
      createHash("sha256")
        .update(readFileSync(resolve(root, path)))
        .digest("hex") !== hashes[path],
  );
  if (changed.length)
    throw new Error(`Selected source content changed: ${changed.join(", ")}`);
}

export function inspectJob(job, { admission = false } = {}) {
  const gaps = [],
    requiredOutputs = [];
  const requireFile = (path) => {
    requiredOutputs.push(path);
    if (!existsSync(path) || !readFileSync(path, "utf8").trim())
      gaps.push(`Required report missing or empty: ${path}`);
  };
  let outcomes = { known: false };
  if (job.runner === "vitest") {
    const selectionPath = join(job.out, "selection.json");
    requireFile(selectionPath);
    const selection = existsSync(selectionPath) ? read(selectionPath) : null;
    const resultFile = join(job.out, "tests.json");
    if (
      selection?.completed &&
      selection.selected.length === 0 &&
      !job.files?.length
    ) {
      outcomes = { notApplicable: true, selection };
    } else {
      requireFile(resultFile);
      const data = existsSync(resultFile) ? read(resultFile) : null;
      outcomes = {
        selection,
        known: !!data,
        total: data?.numTotalTests,
        passed: data?.numPassedTests,
        failed: data?.numFailedTests,
        skipped: data?.numPendingTests,
        todo: data?.numTodoTests ?? 0,
        success: data?.success,
      };
      requireFile(join(job.out, "vitest/lcov.info"));
    }
  } else if (existsSync(join(job.out, "playwright.json"))) {
    const stats = read(join(job.out, "playwright.json")).stats;
    outcomes = {
      known: !!stats,
      total:
        stats &&
        stats.expected + stats.unexpected + stats.skipped + stats.flaky,
      passed: stats && stats.expected + stats.flaky,
      failed: stats?.unexpected,
      skipped: stats?.skipped,
      flaky: stats?.flaky ?? 0,
      todo: 0,
    };
  } else if (existsSync(join(job.out, "junit.xml"))) {
    const counts = JSON.parse(
      execFileSync(
        "python3",
        [
          "-c",
          "import json,sys,xml.etree.ElementTree as E; r=E.parse(sys.argv[1]).getroot(); c=r.findall('.//testcase'); print(json.dumps({'total':len(c), 'failed':sum(x.find('failure') is not None or x.find('error') is not None for x in c),'skipped':sum(x.find('skipped') is not None for x in c)}))",
          join(job.out, "junit.xml"),
        ],
        { encoding: "utf8" },
      ),
    );
    outcomes = {
      known: true,
      ...counts,
      passed: counts.total - counts.failed - counts.skipped,
      todo: 0,
    };
  }
  if (!outcomes.notApplicable) {
    if (
      !outcomes.known ||
      !["total", "passed", "failed", "skipped", "todo"].every(
        (key) => Number.isInteger(outcomes[key]) && outcomes[key] >= 0,
      )
    )
      gaps.push("Case outcomes are unknown or invalid");
    else {
      if (
        outcomes.total !==
        outcomes.passed + outcomes.failed + outcomes.skipped + outcomes.todo
      )
        gaps.push("Case outcome counts do not reconcile");
      if (outcomes.passed + outcomes.failed === 0)
        gaps.push("No test cases executed");
      if (outcomes.failed || outcomes.success === false)
        gaps.push("Test cases or module collection failed");
      if (outcomes.skipped || outcomes.todo)
        gaps.push("Required test cases were skipped or left todo");
      if (outcomes.flaky) gaps.push("Flaky test outcomes were observed");
    }
    if (job.runner === "bun") {
      requireFile(join(job.out, "bun/lcov.info"));
      requireFile(join(job.out, "bun/origin.json"));
      try {
        bunSourceBase(job);
      } catch (error) {
        gaps.push(`Bun source paths cannot be resolved: ${error.message}`);
      }
      gaps.push(
        "Bun built imports lack original-source attribution; nested Bun processes are not collected",
      );
    }
    if (job.runner === "node" || job.runner === "playwright")
      requireFile(join(job.out, "external/lcov.info"));
    if (job.runner === "playwright") {
      if (!job.collection?.browserRecords)
        gaps.push("No browser coverage returned");
      if (
        (job.collection?.browserTestIds?.length ?? 0) <
        (outcomes.passed ?? 0) + (outcomes.failed ?? 0)
      )
        gaps.push("Some browser test cases have no collection identity");
    }
  }
  if (!job.execution || job.execution.code !== 0)
    gaps.push("Suite did not finish successfully");
  if (job.conversion && job.conversion.code !== 0)
    gaps.push("Coverage conversion failed");
  if (admission && job.conversion && job.conversion.receiptValid !== true)
    gaps.push("Conversion input receipt is not valid");
  if (job.preparation && job.preparation.code !== 0)
    gaps.push("Preparation failed");
  if (admission && job.preparation && job.preparation.receiptValid !== true)
    gaps.push("Preparation input receipt is not valid");
  if (admission && job.execution?.receiptValid !== true)
    gaps.push("Suite input receipt is not valid");
  if (job.runner === "custom")
    gaps.push(
      "Inner preparation, Docker or remote collection is not fully observed",
    );
  if (job.collection?.browserWorkerKinds?.length)
    gaps.push(
      "Browser worker startup may precede native profiling; worker coverage is a partial observation",
    );
  gaps.push(...(job.collection?.browserErrors ?? []));
  for (const record of job.collection?.rejectedNodeRecords ?? [])
    gaps.push(
      `Rejected native coverage record: ${record.file}: ${record.reason}`,
    );
  return { outcomes, gaps, requiredOutputs };
}
