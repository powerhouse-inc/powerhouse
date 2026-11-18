import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  openSync,
  closeSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  renameSync,
} from "node:fs";
import { delimiter, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { inspectJob, verifySourceIdentity } from "./results.mjs";
import { archiveRaw } from "./raw.mjs";
import { prepareVitest, recordVitestSelection } from "./vitest.mjs";
import { postgresEnv } from "./suites.mjs";
import {
  requireFreePorts,
  runProcessGroup,
  stopMarkedProcesses,
  stopScenarioProcesses,
} from "./processes.mjs";
import { copyScenario } from "./workspace.mjs";
const read = (path) => JSON.parse(readFileSync(path, "utf8"));
const write = (path, value) =>
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n");
const hash = (path) =>
  createHash("sha256").update(readFileSync(path)).digest("hex");
let interrupted, rejectNative;
const native = new AbortController();
const interrupt = (signal = "SIGTERM") => {
  interrupted = signal;
  native.abort(signal);
  rejectNative?.(new Error(`Interrupted: ${signal}`));
};
process.on("SIGINT", interrupt);
process.on("SIGTERM", interrupt);
process.on("SIGHUP", interrupt);
const onDisconnect = () => interrupt("IPC disconnected");
process.on("disconnect", onDisconnect);
async function acquireNative(job) {
  if (interrupted || !process.connected)
    throw new Error("Native work requires its live coordinator");
  await new Promise((resolve, reject) => {
    const finish = (error, lease) => {
      process.removeListener("message", onMessage);
      rejectNative = undefined;
      if (error) reject(error);
      else {
        job.lease = lease;
        resolve();
      }
    };
    const onMessage = (message) => {
      if (message?.id !== job.id || message.phase !== "native-grant") return;
      finish(
        message.granted
          ? undefined
          : new Error(
              "Native resources are unavailable or the run was interrupted",
            ),
        message.lease,
      );
    };
    rejectNative = (error) => finish(error);
    process.on("message", onMessage);
    process.send({ phase: "native-request", id: job.id }, (error) => {
      if (error) finish(error);
    });
  });
}
// Each command owns a process group; in place, that group is the only proof of process ownership.
async function runCommand(argv, job, name, env) {
  const started = performance.now();
  const destination = join(job.out, name);
  mkdirSync(destination, { recursive: true });
  const log = openSync(join(destination, "output.log"), "wx");
  let result;
  try {
    result = await runProcessGroup(argv, {
      cwd: job.cwd,
      env,
      log,
      signal: native.signal,
    });
  } finally {
    closeSync(log);
  }
  result.durationMs = performance.now() - started;
  job.timing[name + "Ms"] = result.durationMs;
  write(join(destination, "result.json"), result);
  return result;
}
async function observeJob(input) {
  const { job, context } = input;
  const { root, out, sourceFile, implementation } = context;
  const run = context;
  job.timing = { startedAt: new Date().toISOString() };
  const started = performance.now();
  const timed = (name, action) => {
    const begin = performance.now();
    try {
      return action();
    } finally {
      job.timing[name] = (job.timing[name] ?? 0) + performance.now() - begin;
    }
  };
  write(join(job.out, "job.json"), job);
  const inPlace = input.workspace.inPlace === true;
  if (inPlace && !input.marker)
    throw new Error(
      "In-place jobs need an ownership marker from the coordinator",
    );
  const marker = input.marker;
  const groups = [];
  // In place, the checkout path proves nothing: ownership is the process group plus an inherited marker.
  const stopOwned = async (scenario) => {
    if (!inPlace) return await stopScenarioProcesses(scenario);
    const marked = await stopMarkedProcesses(marker);
    return {
      ...marked,
      method: "process-group+environment",
      valid:
        marked.valid &&
        groups.every((result) => result.groupCleanup?.valid === true),
    };
  };
  try {
    let scenario;
    try {
      {
        const candidate = realpathSync(input.scenarioRoot);
        // Checked before `scenario` is set: cleanup by path would otherwise target the checkout.
        if (inPlace !== (candidate === root))
          throw new Error(
            "Only in-place jobs may run in the reference checkout",
          );
        scenario = candidate;
        if (!input.workspace.reuse && readdirSync(scenario).length)
          throw new Error("Private scenario must start empty");
        job.scenario = {
          referenceRoot: root,
          sourceHashesMatch: false,
          workspaceId: input.workspace.id,
          inPlace,
        };
        job.root = scenario;
        write(join(job.out, "job.json"), job);
        if (!input.workspace.reuse)
          timed("cloneMs", () => {
            for (const name of readdirSync(root))
              copyScenario(join(root, name), join(scenario, name), [
                out,
                ...(context.copyExclusions ?? []),
              ]);
          });
        job.cwd = join(scenario, relative(root, job.cwd));
        job.args = job.args.map((arg) =>
          arg === root || arg.startsWith(root + sep)
            ? join(scenario, relative(root, arg))
            : arg,
        );
        job.root = scenario;
        timed("sourceVerifyMs", () => {
          for (const [path, digest] of Object.entries(run.sourceHashes))
            if (hash(join(scenario, path)) !== digest)
              throw new Error(`Scenario input differs from snapshot: ${path}`);
        });
        job.scenario.sourceHashesMatch = true;
        process.send?.({ phase: "cloned", id: job.id });
        write(join(job.out, "job.json"), job);
      }
      if (interrupted) throw new Error(`Interrupted: ${interrupted}`);
      const pkg = existsSync(join(job.cwd, "package.json"))
        ? read(join(job.cwd, "package.json"))
        : {};
      const env = {
        ...process.env,
        CI: "true",
        ...job.env,
        npm_package_name: pkg.name ?? "",
        npm_package_version: pkg.version ?? "",
        PLAYWRIGHT_HTML_OPEN: "never",
      };
      if (scenario)
        for (const key of [
          "PATH",
          "NODE_PATH",
          "INIT_CWD",
          "npm_package_json",
          "PNPM_SCRIPT_SRC_DIR",
        ])
          if (env[key])
            env[key] = env[key]
              .split(delimiter)
              .map((path) =>
                path === root || path.startsWith(root + sep)
                  ? join(scenario, relative(root, path))
                  : path,
              )
              .join(delimiter);
      if (job.runner === "bun")
        env.PATH = `${join(out, "bun-bin")}:${env.PATH}`;
      for (const key of Object.keys(env))
        if (key.startsWith("PH_COVERAGE_") || key === "NODE_V8_COVERAGE")
          delete env[key];
      if (inPlace) env.PH_COVERAGE_OWNER = marker;
      const waitingStarted = performance.now();
      try {
        await acquireNative(job);
      } finally {
        job.timing.resourceWaitMs = performance.now() - waitingStarted;
      }
      if (job.lease?.pool) Object.assign(env, postgresEnv(job.lease.pool));
      try {
        await requireFreePorts(job.resources.preflightPorts);
        if (job.prepare) {
          job.preparation = await runCommand(
            job.prepare,
            job,
            "preparation",
            env,
          );
          groups.push(job.preparation);
          if (job.preparation.code !== 0) {
            job.gaps = ["Preparation failed; test cases did not execute"];
            return job;
          }
        }
        env.NODE_V8_COVERAGE = join(job.out, "node");
        env.PH_COVERAGE_BROWSER_DIR = join(job.out, "browser");
        env.PH_COVERAGE_ROOT = job.root;
        env.PH_COVERAGE_SOURCES = sourceFile;
        env.PLAYWRIGHT_JSON_OUTPUT_FILE = join(job.out, "playwright.json");
        const argv =
          job.runner === "vitest"
            ? prepareVitest(job, context.copyExclusions ?? [])
            : [...job.args];
        if (job.runner === "bun") {
          mkdirSync(join(job.out, "bun"), { recursive: true });
          env.PH_COVERAGE_BUN_ORIGIN = join(job.out, "bun/origin.json");
          argv.push(
            "--preload",
            join(implementation, "bun.mjs"),
            "--coverage",
            "--coverage-reporter=lcov",
            "--coverage-dir",
            join(job.out, "bun"),
            "--reporter=junit",
            "--reporter-outfile",
            join(job.out, "junit.xml"),
          );
        }
        if (job.runner === "node")
          argv.splice(
            1,
            0,
            "--test-reporter=junit",
            `--test-reporter-destination=${join(job.out, "junit.xml")}`,
          );
        if (job.runner === "playwright")
          argv.push(
            "--reporter=line,json",
            "--output",
            join(job.out, "playwright-results"),
          );
        job.execution = await runCommand(argv, job, "execution", env);
        groups.push(job.execution);
      } finally {
        const cleanupStarted = performance.now();
        job.cleanup = await stopOwned(scenario);
        job.timing.cleanupMs = performance.now() - cleanupStarted;
        if (process.connected)
          process.send(
            { phase: "native-release", id: job.id, cleanup: job.cleanup },
            (error) => {
              if (error) interrupt(error.message);
            },
          );
      }
      if (!job.cleanup.valid) {
        job.withholdCoverage =
          "Owned processes did not stop; coverage withheld";
        job.collection = { valid: false };
        job.gaps = [job.withholdCoverage];
        return job;
      }
      if (job.runner === "vitest") recordVitestSelection(job);
      job.outcomes = inspectJob(job).outcomes;
      const conversionEnv = { ...env };
      for (const key of Object.keys(conversionEnv))
        if (key.startsWith("PH_COVERAGE_") || key === "NODE_V8_COVERAGE")
          delete conversionEnv[key];
      job.conversion = await runCommand(
        [
          process.execPath,
          join(implementation, "report.mjs"),
          "external",
          join(job.out, "job.json"),
        ],
        job,
        "conversion",
        conversionEnv,
      );
      job.collection = existsSync(join(job.out, "collection.json"))
        ? read(join(job.out, "collection.json"))
        : {
            valid: false,
            error: "Collection analysis did not publish a result",
          };
      Object.assign(job, inspectJob(job));
      if (job.withholdCoverage)
        job.gaps.push(`${job.withholdCoverage}; coverage withheld`);
    } catch (error) {
      job.collection = { ...job.collection, valid: false };
      job.gaps = [`Collection failed: ${error.stack ?? error}`];
      job.error = String(error.stack ?? error);
    } finally {
      if (scenario) {
        job.cleanup ??= await stopOwned(scenario);
        if (job.scenario.sourceHashesMatch) {
          let sourceIdentityValid = true;
          job.scenario.changedProductSource = timed("sourceVerifyMs", () =>
            Object.entries(run.sourceHashes)
              .filter(
                ([path, digest]) =>
                  !existsSync(join(scenario, path)) ||
                  hash(join(scenario, path)) !== digest,
              )
              .map(([path]) => path),
          );
          // In place, new files may be another job's temporary output; the run checks the source set at the end.
          if (!inPlace)
            try {
              timed("sourceVerifyMs", () =>
                verifySourceIdentity(
                  scenario,
                  read(sourceFile),
                  run.sourceHashes,
                ),
              );
            } catch (error) {
              sourceIdentityValid = false;
              job.withholdCoverage = `Scenario source identity changed: ${error.message}`;
              job.gaps = [...(job.gaps ?? []), job.withholdCoverage];
              job.collection = { ...job.collection, valid: false };
            }
          if (job.scenario.changedProductSource.length) {
            job.withholdCoverage ??=
              "Scenario changed measured product source; coverage withheld";
            job.collection = { ...job.collection, valid: false };
            job.gaps = [
              ...(job.gaps ?? []),
              "Scenario changed measured product source; coverage withheld",
            ];
          }
          // Concurrent jobs see each other's temporary test files, so only measured source decides validity
          // in place; the run checks every Git-visible input once all jobs have finished.
          if (inPlace)
            job.scenario.inputValidAfter =
              sourceIdentityValid && !job.scenario.changedProductSource.length;
          job.scenario.status = timed("statusMs", () =>
            execFileSync("git", ["-C", scenario, "status", "--porcelain"], {
              // Never take index.lock in a checkout the user may be committing in.
              env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
              encoding: "utf8",
              maxBuffer: 16 * 1024 * 1024,
            })
              .split("\n")
              .filter(Boolean),
          );
        }
        if (inPlace) {
          if (!job.cleanup.valid)
            job.gaps = [
              ...(job.gaps ?? []),
              "In-place process group did not stop; shared services stay blocked",
            ];
        } else if (job.cleanup.valid) {
          timed("deleteMs", () =>
            rmSync(scenario, { recursive: true, force: true }),
          );
          job.scenario.deleted = true;
        } else
          job.gaps = [
            ...(job.gaps ?? []),
            "Owned process cleanup failed; private tree retained",
          ];
      }
    }

    const archivalStarted = performance.now();
    job.rawArchives = [];
    try {
      archiveRaw(job.out, job.rawArchives);
    } catch (error) {
      job.gaps = [...(job.gaps ?? []), `Raw input archival failed: ${error}`];
    }
    const artifacts = [
      ...(job.rawArchives ?? []).map((item) => join(job.out, item.archive)),
      ...(job.requiredOutputs ?? []),
      ...(job.coverageInput
        ? [job.coverageInput, join(job.out, "coverage.config.mjs")]
        : []),
      ...[
        "vitest/lcov.info",
        "vitest/coverage-summary.json",
        "external/lcov.info",
        "external/coverage-summary.json",
        "bun/lcov.info",
        "bun/origin.json",
        "collection.json",
      ].map((name) => join(job.out, name)),
    ];
    job.artifactHashes = Object.fromEntries(
      [...new Set(artifacts)]
        .filter(existsSync)
        .map((path) => [path, hash(path)]),
    );
    job.timing.archivalMs = performance.now() - archivalStarted;

    return job;
  } finally {
    job.timing.durationMs = performance.now() - started;
    job.timing.finishedAt = new Date().toISOString();
    write(join(job.out, "result.json.tmp"), job);
    renameSync(join(job.out, "result.json.tmp"), join(job.out, "result.json"));
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const input = read(process.argv[2]);
  try {
    await observeJob({ ...input, context: read(input.contextFile) });
  } finally {
    process.removeListener("SIGINT", interrupt);
    process.removeListener("SIGTERM", interrupt);
    process.removeListener("SIGHUP", interrupt);
    process.removeListener("disconnect", onDisconnect);
  }
}
