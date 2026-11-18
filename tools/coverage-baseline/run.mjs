import { spawn, execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  closeSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  realpathSync,
  statfsSync,
  symlinkSync,
  renameSync,
} from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import semver from "semver";
import { sourceFiles, packageVersion } from "./config.mjs";
import { discoverSuites, tierPolicy, tierRules } from "./suites.mjs";
import { inspectJob, verifySourceIdentity, isComplete } from "./results.mjs";
import { capacity, demand, runsInPlace, schedule } from "./schedule.mjs";
import {
  runProcessGroup,
  stopMarkedProcesses,
  stopScenarioProcesses,
} from "./processes.mjs";
import { inputDigest, nestedWorktrees } from "./workspace.mjs";

const { values } = parseArgs({
  options: {
    out: { type: "string", default: "coverage/baseline" },
    root: { type: "string", default: process.cwd() },
    suite: { type: "string", multiple: true },
    owner: { type: "string", multiple: true },
    tier: { type: "string", multiple: true },
    all: { type: "boolean", default: false },
    bun: { type: "string", default: process.env.PH_COVERAGE_BUN ?? "bun" },
    jobs: { type: "string", default: "auto" },
    "registry-ref": { type: "string", default: "origin/main" },
    "render-only": { type: "boolean", default: false },
  },
});
const programStarted = performance.now();
const limits = capacity(values.jobs);
const root = realpathSync(resolve(values.root)),
  destination = resolve(values.out);
const implementation = dirname(fileURLToPath(import.meta.url));
const read = (path) => JSON.parse(readFileSync(path, "utf8"));
const write = (path, value) =>
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n");
const hash = (path) =>
  createHash("sha256").update(readFileSync(path)).digest("hex");
if (
  !values["render-only"] &&
  existsSync(destination) &&
  readdirSync(destination).length
)
  throw new Error(`Output must be new or empty: ${destination}`);
mkdirSync(destination, { recursive: true });
const out = realpathSync(destination);
const excludedOutput = out.startsWith(root + sep)
  ? relative(root, out).replaceAll("\\", "/")
  : null;
const sourceFile = join(out, "sources.json");
const sources = values["render-only"] ? read(sourceFile) : sourceFiles(root);
if (!sources.length) throw new Error("No tracked product source selected");
if (!values["render-only"]) write(sourceFile, sources);

if (values.all && (values.tier?.length || values.suite?.length))
  throw new Error("--all selects every tier; drop --tier and --suite");
// E2E scenarios install, build and publish; collect them on request only.
const tiers = values.all
  ? ["unit", "integration", "e2e"]
  : (values.tier ?? (values.suite?.length ? null : ["unit", "integration"]));
let needsCopies = false;
function spaceIssue(gib) {
  if (!needsCopies) return;
  for (const path of [out, dirname(root)]) {
    const { bavail, bsize } = statfsSync(path);
    if (bavail * bsize < gib * 1024 ** 3)
      return `Coverage requires at least ${gib} GiB free at ${path}; available ${((bavail * bsize) / 1024 ** 3).toFixed(1)} GiB`;
  }
}

async function runCommand(argv, job, name, env, signal = controller.signal) {
  const destination = join(job.out, name);
  mkdirSync(destination, { recursive: true });
  const log = openSync(join(destination, "output.log"), "wx");
  let result;
  try {
    result = await runProcessGroup(argv, {
      cwd: job.cwd,
      env,
      log,
      signal,
    });
  } finally {
    closeSync(log);
  }
  write(join(destination, "result.json"), result);
  return result;
}

const controller = new AbortController();
const onInterrupt = () => controller.abort("SIGINT");
const onTerminate = () => controller.abort("SIGTERM");
process.on("SIGINT", onInterrupt);
process.on("SIGTERM", onTerminate);
process.on("SIGHUP", onTerminate);
let run;
if (values["render-only"]) {
  run = read(join(out, "run.json"));
  verifySourceIdentity(root, sources, run.sourceHashes);
  if (
    Object.entries(run.implementationHashes ?? {}).some(
      ([name, digest]) =>
        !existsSync(join(implementation, name)) ||
        hash(join(implementation, name)) !== digest,
    )
  )
    throw new Error("Coverage implementation changed since collection");
  if (run.lockfileHash !== hash(join(root, "pnpm-lock.yaml")))
    throw new Error("Lockfile changed since collection");
  for (const job of run.jobs) {
    for (const [path, digest] of Object.entries(job.artifactHashes ?? {})) {
      if (!existsSync(path) || hash(path) !== digest)
        throw new Error(`Collected report changed or missing: ${path}`);
    }
  }
} else {
  const all = discoverSuites(root);
  const jobs = all.filter(
    (job) =>
      (!values.suite?.length || values.suite.includes(job.id)) &&
      (!values.owner?.length || values.owner.includes(job.owner)) &&
      (!tiers || tiers.includes(job.tier)),
  );
  if (!jobs.length)
    throw new Error(
      `No requested suite exists${tiers ? ` in tiers ${tiers.join(", ")}; add --tier e2e or --all for E2E` : ""}`,
    );
  needsCopies = jobs.some((job) => !runsInPlace(job));
  const registry = jobs.find((job) => job.owner === "test/registry-e2e");
  if (registry) {
    registry.gitRefs = {};
    for (const [label, ref] of Object.entries({
      A: values["registry-ref"],
      B: "HEAD",
    })) {
      const commit = execFileSync(
        "git",
        [
          "-C",
          root,
          "rev-parse",
          "--verify",
          "--end-of-options",
          `${ref}^{commit}`,
        ],
        { encoding: "utf8" },
      ).trim();
      registry.gitRefs[label] = { ref, commit };
      registry.args.push(`${label}=${commit}`);
    }
  }
  const initialSpaceIssue = spaceIssue(15);
  if (initialSpaceIssue) throw new Error(initialSpaceIssue);
  const bunVersion = jobs.some((job) => job.runner === "bun")
    ? execFileSync(values.bun, ["--version"], { encoding: "utf8" }).trim()
    : null;
  if (
    jobs.some((job) => job.runner === "bun") &&
    !semver.gte(bunVersion, "1.4.4")
  )
    throw new Error(
      "Native Bun coverage requires Bun >=1.4.4; older versions produce false line hits. Use --bun /path/to/bun.",
    );
  const bunBinary = bunVersion
    ? realpathSync(
        execFileSync("which", [values.bun], { encoding: "utf8" }).trim(),
      )
    : null;
  if (bunBinary) {
    mkdirSync(join(out, "bun-bin"));
    symlinkSync(bunBinary, join(out, "bun-bin/bun"));
  }
  run = {
    methodology: "native-coverage/3",
    startedAt: new Date().toISOString(),
    root,
    revision: execFileSync("git", ["-C", root, "rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim(),
    lockfileHash: hash(join(root, "pnpm-lock.yaml")),
    sourceHashes: Object.fromEntries(
      sources.map((path) => [path, hash(resolve(root, path))]),
    ),
    inputDigest: inputDigest(root, excludedOutput),
    implementationHashes: Object.fromEntries(
      readdirSync(implementation)
        .filter((name) => /\.(?:mjs|mts)$/.test(name) || name === "README.md")
        .map((name) => [name, hash(join(implementation, name))]),
    ),
    versions: Object.fromEntries(
      [
        "vitest",
        "@vitest/coverage-v8",
        "@vitest/coverage-istanbul",
        "monocart-coverage-reports",
        "chrome-remote-interface",
        "istanbul-reports",
        "@playwright/test",
      ].map((name) => [name, packageVersion(root, name)]),
    ),
    node: process.version,
    bun: bunVersion,
    bunBinary,
    plannedSuites: jobs.map((job) => job.id),
    tiers: [...new Set(jobs.map((job) => job.tier))].sort(),
    tierPolicy,
    tierRules,
    commonMetric: "lines",
    resourcePolicy: {
      needsCopies,
      startupGiB: 15,
      cloneGiB: 8,
      workspaceState:
        "Vitest owners run in place in the reference checkout, one at a time per owner, with shared services held; consumer, Playwright, Bun and Node scenarios get fresh private copies",
      ...limits,
      reservations:
        "Separate resident/native ceilings; phase estimates: copy 1 CPU/0.5 GiB; ready 0 CPU/0.5 GiB; native job estimate; conversion 1 CPU/job memory. Native pools and worker limits remain unchanged",
    },
    complete: false,
    jobs: [],
    limitations: [
      "Test levels use declared paths and source-reviewed overrides; legacy-unreviewed files default to unit. Mixed files use one containing level. Purpose labels add no separate coverage percentages.",
      "Native Bun does not supply mergeable branch/function/statement identities.",
      "Docker/remote execution and preparation embedded in custom wrappers are not completely observed.",
    ],
  };
  const contextFile = join(out, "context.json");
  run.copyExclusions = nestedWorktrees(root);
  // In-place tests run against uncommitted work; this commit object restores its tracked files.
  if (jobs.some(runsInPlace)) {
    const stash = execFileSync("git", ["-C", root, "stash", "create"], {
      encoding: "utf8",
      env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
    }).trim();
    run.restorePoint = stash
      ? { commit: stash, command: `git stash apply ${stash}` }
      : { commit: run.revision, command: "git checkout -- ." };
  }
  write(contextFile, {
    copyExclusions: run.copyExclusions,
    root,
    out,
    sourceFile,
    implementation,
    sourceHashes: run.sourceHashes,
    inputDigest: run.inputDigest,
    excludedOutput,
    resourcePolicy: run.resourcePolicy,
  });
  const weightsFile = join(root, "scripts/test-weights.json");
  const weights = existsSync(weightsFile) ? read(weightsFile) : {};
  for (const item of jobs) {
    const manifest = join(root, item.owner, "package.json");
    const name = existsSync(manifest) ? read(manifest).name : undefined;
    if (typeof weights[name] === "number") item.weight = weights[name];
  }
  run.jobs = jobs.map((item, index) => ({
    ...item,
    index,
    env: { ...item.env },
    root,
    sourceFile,
    out: join(
      out,
      "suites",
      `${String(index + 1).padStart(3, "0")}-${item.id.replaceAll(/[^\w.-]/g, "-")}`,
    ),
    resources: demand(item),
    status: "queued",
    queuedAt: new Date().toISOString(),
  }));
  const save = () => {
    write(join(out, "run.json.tmp"), run);
    renameSync(join(out, "run.json.tmp"), join(out, "run.json"));
  };
  save();
  let completed = 0,
    running = 0;
  for (const job of run.jobs) {
    if (job.runner !== "vitest" || job.files.length) continue;
    mkdirSync(job.out, { recursive: true });
    const selection = join(job.out, "selection.json");
    write(selection, {
      discovered: [],
      selected: [],
      completed: true,
      error: null,
    });
    job.execution = {
      code: 0,
      notRun: true,
      reason: "No Git-visible test files in this tier",
    };
    job.outcomes = inspectJob(job).outcomes;
    job.collection = { valid: true, nodeRecords: 0, browserRecords: 0 };
    job.gaps = [];
    job.status = "not-applicable";
    job.artifactHashes = { [selection]: hash(selection) };
    completed++;
  }
  save();
  try {
    run.workspaces = await schedule(
      run.jobs.filter((job) => job.status !== "not-applicable"),
      limits,
      {
        createWorkspace: (id) => ({
          id,
          root: realpathSync(
            mkdtempSync(join(dirname(root), "ph-coverage-scenario-")),
          ),
        }),
        disposeWorkspace: async (workspace) => {
          const folder = join(out, "workspaces", String(workspace.id));
          mkdirSync(folder, { recursive: true });
          const input = join(folder, "input.json"),
            receipt = join(folder, "receipt.json");
          write(input, {
            workspace,
            inputDigest: run.inputDigest,
            excludedOutput,
            receipt,
          });
          const env = { ...process.env };
          for (const key of Object.keys(env))
            if (key.startsWith("PH_COVERAGE_") || key === "NODE_V8_COVERAGE")
              delete env[key];
          const execution = await runCommand(
            [process.execPath, join(implementation, "workspace.mjs"), input],
            { cwd: root, out: folder },
            "disposal",
            env,
            new AbortController().signal,
          );
          if (!existsSync(receipt))
            return {
              deleted: false,
              execution,
              error: "Workspace disposal did not publish a receipt",
            };
          const result = read(receipt);
          if (result.root !== workspace.root)
            throw new Error("Workspace disposal identity mismatch");
          return { ...result, execution };
        },
        execute: async (job, phases, workspace) => {
          job.status = "running";
          job.dispatchedAt = new Date().toISOString();
          running++;
          save();
          console.log(
            `[${completed}/${jobs.length} finished; ${running} running] START ${job.id}`,
          );
          mkdirSync(job.out, { recursive: true });
          const workerRoot = workspace.root;
          job.root = workerRoot;
          job.scenario = {
            referenceRoot: root,
            sourceHashesMatch: false,
            ...(workspace.inPlace
              ? { inPlace: true }
              : { retainedRoot: workerRoot }),
          };
          const input = join(job.out, "input.json");
          const marker = randomUUID();
          write(input, {
            marker,
            job,
            contextFile,
            scenarioRoot: workerRoot,
            workspace,
          });
          const fd = openSync(join(job.out, "worker.log"), "wx");
          const env = { ...process.env };
          for (const key of Object.keys(env))
            if (key.startsWith("PH_COVERAGE_") || key === "NODE_V8_COVERAGE")
              delete env[key];
          const child = spawn(
            process.execPath,
            [join(implementation, "job.mjs"), input],
            { cwd: root, env, stdio: ["ignore", fd, fd, "ipc"] },
          );
          let killTimer,
            protocolError,
            workerPhase = "cloning";
          job.workerPid = child.pid;
          save();
          child.on("message", async (message) => {
            if (message?.id !== job.id) return;
            try {
              if (message.phase === "cloned" && workerPhase === "cloning") {
                phases.cloned();
                workerPhase = "ready";
              } else if (
                message.phase === "native-request" &&
                workerPhase === "ready"
              ) {
                workerPhase = "waiting";
                const granted = await phases.acquire();
                if (child.connected && !controller.signal.aborted) {
                  workerPhase = granted ? "native" : "denied";
                  child.send({
                    phase: "native-grant",
                    id: job.id,
                    granted,
                    lease: job.lease,
                  });
                }
              } else if (
                message.phase === "native-release" &&
                workerPhase === "native"
              ) {
                if (
                  typeof message.cleanup?.valid !== "boolean" ||
                  !Array.isArray(message.cleanup.remaining) ||
                  (message.cleanup.valid && message.cleanup.remaining.length)
                )
                  throw new Error(
                    "Worker published an invalid native cleanup receipt",
                  );
                phases.release(message.cleanup);
                workerPhase = "private";
              }
            } catch (error) {
              protocolError = String(error);
              stop();
            }
          });
          const stop = () => {
            child.kill("SIGTERM");
            killTimer = setTimeout(() => child.kill("SIGKILL"), 30000);
          };
          controller.signal.addEventListener("abort", stop, { once: true });
          let result;
          try {
            result = await new Promise((done) => {
              child.once("error", (error) =>
                done({ pid: child.pid, code: 1, error: String(error) }),
              );
              child.once("close", (code, signal) =>
                done({ pid: child.pid, code, signal }),
              );
            });
          } finally {
            controller.signal.removeEventListener("abort", stop);
            clearTimeout(killTimer);
            closeSync(fd);
          }
          const resultPath = join(job.out, "result.json");
          let observed;
          try {
            observed = read(resultPath);
            if (
              observed.id !== job.id ||
              observed.out !== job.out ||
              observed.index !== job.index ||
              observed.root !== workerRoot ||
              observed.scenario?.workspaceId !== workspace.id ||
              !Array.isArray(observed.gaps)
            )
              throw new Error("Result does not match its planned identity");
          } catch (error) {
            observed = {
              ...job,
              gaps: [
                `Coverage worker did not publish a valid observation: ${error.message}`,
              ],
              collection: { valid: false },
            };
          }
          if (result.code !== 0) {
            observed.gaps = [
              ...(observed.gaps ?? []),
              `Coverage worker exited with ${result.code ?? result.signal}`,
            ];
            observed.withholdCoverage =
              "Coverage worker did not finish successfully";
          }
          if (workerRoot && !observed.scenario) {
            observed.root = workerRoot;
            observed.scenario = {
              referenceRoot: root,
              sourceHashesMatch: false,
              ...(workspace.inPlace
                ? { inPlace: true }
                : { retainedRoot: workerRoot }),
            };
          }
          // A worker that died before its own cleanup leaves this to the coordinator.
          if (!observed.cleanup) {
            try {
              observed.cleanup = workspace.inPlace
                ? await stopMarkedProcesses(marker)
                : await stopScenarioProcesses(workerRoot);
            } catch (error) {
              observed.cleanup = { valid: false, error: String(error) };
            }
          }
          if (protocolError) {
            observed.gaps = [...(observed.gaps ?? []), protocolError];
            observed.withholdCoverage = protocolError;
          }
          observed.worker = result;
          observed.status = observed.outcomes?.notApplicable
            ? "not-applicable"
            : "finished";
          if (controller.signal.aborted)
            observed.gaps = [
              ...(observed.gaps ?? []),
              "Coverage run interrupted",
            ];
          return observed;
        },
        settled: (observed) => {
          if (run.jobs[observed.index].status === "running") running--;
          observed.status ??= "finished";
          run.jobs[observed.index] = observed;
          completed++;
          save();
          console.log(
            `[${completed}/${jobs.length} finished; ${running} running] END ${observed.id}${observed.gaps?.length ? " (partial)" : ""}`,
          );
        },
        signal: controller.signal,
        referenceRoot: root,
        admissionIssue: () => spaceIssue(run.resourcePolicy.cloneGiB),
      },
    );
  } catch (error) {
    controller.abort(error);
    throw error;
  }
  if (run.workspaces.some((workspace) => workspace.state === "retained"))
    run.limitations.push(
      "Some owned workspaces could not be safely deleted; see workspace closure receipts",
    );
  try {
    verifySourceIdentity(root, sources, run.sourceHashes);
    run.sourceChanged = [];
  } catch (error) {
    run.sourceChanged = [String(error)];
  }
  // Only measured source invalidates the reports; other lasting changes make the run incomplete.
  run.inputsChanged = inputDigest(root, excludedOutput) !== run.inputDigest;
  if (run.inputsChanged)
    run.limitations.push(
      "Git-visible files outside measured source changed during the run; see git status",
    );
  run.complete =
    !run.sourceChanged.length &&
    !run.inputsChanged &&
    run.workspaces.every((workspace) => workspace.state === "deleted") &&
    run.jobs.length === run.plannedSuites.length &&
    isComplete(run.jobs);
  run.collectedAt = new Date().toISOString();
  write(join(out, "run.json"), run);
}
if (run.sourceChanged?.length)
  throw new Error(
    `Measured product source changed: ${run.sourceChanged.join(", ")}${run.restorePoint ? `\nTracked files as they were before the run: ${run.restorePoint.command}` : ""}`,
  );
const renderJob = { cwd: root, out };
const renderEnv = { ...process.env };
for (const key of Object.keys(renderEnv))
  if (key.startsWith("PH_COVERAGE_") || key === "NODE_V8_COVERAGE")
    delete renderEnv[key];
const renderLog = `rendering-${Date.now()}`;
run.rendering = await runCommand(
  [
    process.execPath,
    join(implementation, "report.mjs"),
    "render",
    join(out, "run.json"),
  ],
  renderJob,
  renderLog,
  renderEnv,
);
if (run.rendering.code !== 0) run.complete = false;
if (values["render-only"]) {
  run.rerenderedAt = new Date().toISOString();
  run.rerenderElapsedMs = performance.now() - programStarted;
} else {
  run.finishedAt = new Date().toISOString();
  run.elapsedMs = performance.now() - programStarted;
}
write(join(out, "run.json"), run);
process.removeListener("SIGINT", onInterrupt);
process.removeListener("SIGTERM", onTerminate);
process.removeListener("SIGHUP", onTerminate);
if (controller.signal.aborted)
  process.exitCode = controller.signal.reason === "SIGTERM" ? 143 : 130;
else if (run.rendering.code !== 0) {
  const log = join(out, renderLog, "output.log");
  const tail = existsSync(log)
    ? readFileSync(log, "utf8").trim().split("\n").slice(-12).join("\n")
    : "";
  throw new Error(`Report generation failed; see ${log}\n${tail}`);
}
console.log(
  controller.signal.aborted
    ? `Interrupted: collection ledger saved at ${join(out, "run.json")}`
    : `Report: ${join(out, "report", "index.html")} (${run.complete ? "complete" : "PARTIAL: see run.json"})`,
);

if (!run.complete && !controller.signal.aborted) process.exitCode = 1;
