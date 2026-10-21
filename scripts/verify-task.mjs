import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { constants } from "node:os";
import {
  accessSync,
  closeSync,
  constants as fsConstants,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import {
  checkContext,
  checkoutPath,
  evidenceDirectory,
  readContext,
  remainingTime,
  repository,
} from "./agent-context.mjs";
import { verificationProfile } from "./verification-profiles.mjs";

const digest = (value) => createHash("sha256").update(value).digest("hex");
const exitFor = (step) =>
  step.outcome === "timeout"
    ? 124
    : step.outcome === "spawn-error"
      ? 127
      : step.signal
        ? 128 + (constants.signals[step.signal] ?? 0)
        : step.exitCode;

function validatePlan(plan, root, context) {
  if (
    typeof plan?.name !== "string" ||
    !Array.isArray(plan.inputs) ||
    !plan.inputs.length
  ) {
    throw new Error("Plan requires name and nonempty inputs");
  }
  for (const input of plan.inputs) {
    const normalized =
      relative(root, checkoutPath(root, input)).split(sep).join("/") || ".";
    if (
      !context.inputs.some(
        (scope) =>
          scope === "." ||
          normalized === scope ||
          normalized.startsWith(`${scope}/`),
      )
    ) {
      throw new Error(`Context does not cover profile input: ${input}`);
    }
  }
  for (const phase of ["preflight", "builds", "checks"]) {
    if (!Array.isArray(plan[phase])) throw new Error(`Plan requires ${phase}`);
    for (const command of plan[phase]) {
      if (
        !Array.isArray(command.argv) ||
        !command.argv.length ||
        !command.argv.every((arg) => typeof arg === "string") ||
        !command.argv[0]
      ) {
        throw new Error("Each command requires a nonempty argv array");
      }
      if (!Number.isSafeInteger(command.timeoutMs) || command.timeoutMs <= 0)
        throw new Error("Each command requires a positive timeoutMs");
      const cwd = checkoutPath(root, command.cwd);
      if (!existsSync(cwd) || !statSync(cwd).isDirectory())
        throw new Error(`Missing command directory: ${cwd}`);
      if (
        command.env !== undefined &&
        (command.env === null ||
          typeof command.env !== "object" ||
          Array.isArray(command.env) ||
          !Object.values(command.env).every(
            (value) => typeof value === "string",
          ))
      ) {
        throw new Error("Command env must contain string values");
      }
    }
  }
  if (!plan.checks.length)
    throw new Error("A verification plan requires at least one check");
  for (const field of ["prerequisites", "outputs"]) {
    if (plan[field] !== undefined && !Array.isArray(plan[field]))
      throw new Error(`${field} must be an array`);
    (plan[field] ?? []).forEach((path) => checkoutPath(root, path));
  }
  return plan;
}

function executable(command, root) {
  const cwd = checkoutPath(root, command.cwd);
  const env = { ...process.env, ...command.env };
  const name = command.argv[0];
  const paths =
    isAbsolute(name) || name.includes("/")
      ? [resolve(cwd, name)]
      : (env.PATH ?? "")
          .split(process.platform === "win32" ? ";" : ":")
          .map((dir) => resolve(cwd, dir, name));
  for (const path of paths) {
    try {
      accessSync(path, fsConstants.X_OK);
      if (statSync(path).isFile()) return path;
    } catch {
      continue;
    }
  }
  throw new Error(
    `Missing executable ${name}. Install the selected profile's prerequisites before running verification.`,
  );
}

async function execute(command, root, directory, deadline) {
  const program = executable(command, root);
  mkdirSync(directory);
  const stdout = resolve(directory, "stdout.log");
  const stderr = resolve(directory, "stderr.log");
  const out = openSync(stdout, "wx");
  const err = openSync(stderr, "wx");
  const started = performance.now();
  const timeoutMs = Math.min(
    command.timeoutMs,
    Math.max(1, deadline - started),
  );
  let spawnError;
  let termination;
  let cleanup = Promise.resolve();
  const child = spawn(program, command.argv.slice(1), {
    cwd: checkoutPath(root, command.cwd),
    env: { ...process.env, ...command.env },
    stdio: ["ignore", out, err],
    detached: process.platform !== "win32",
    shell: false,
  });
  const kill = (signal) => {
    try {
      if (process.platform === "win32") child.kill(signal);
      else process.kill(-child.pid, signal);
    } catch (error) {
      if (error.code !== "ESRCH") spawnError ??= error;
    }
  };
  const stop = (cause) => {
    if (termination) return;
    termination = cause;
    kill("SIGTERM");
    cleanup = new Promise((done) =>
      setTimeout(() => {
        kill("SIGKILL");
        done();
      }, 500),
    );
  };
  const handlers = ["SIGINT", "SIGTERM", "SIGHUP", "SIGQUIT"].map((signal) => {
    const handler = () => {
      stop({ outcome: "interrupted", signal });
    };
    process.on(signal, handler);
    return [signal, handler];
  });
  const timer = setTimeout(() => {
    stop({ outcome: "timeout" });
  }, timeoutMs);
  if (child.pid) {
    writeFileSync(
      resolve(directory, "process.json"),
      `${JSON.stringify(
        {
          pid: child.pid,
          processGroupId: process.platform === "win32" ? null : child.pid,
          argv: command.argv,
        },
        null,
        2,
      )}\n`,
      { flag: "wx" },
    );
  }
  const result = await new Promise((done) => {
    child.on("error", (error) => {
      spawnError = error;
    });
    child.on("close", (exitCode, signal) => done({ exitCode, signal }));
  });
  clearTimeout(timer);
  await cleanup;
  handlers.forEach(([signal, handler]) => process.off(signal, handler));
  closeSync(out);
  closeSync(err);
  return {
    outcome:
      termination?.outcome ??
      (spawnError ? "spawn-error" : result.signal ? "signal" : "exit"),
    ...result,
    signal: termination?.signal ?? result.signal,
    ...(spawnError ? { error: spawnError.message } : {}),
    durationMs: Math.round(performance.now() - started),
    stdout,
    stderr,
  };
}

function writeReport(directory, report) {
  const pending = resolve(directory, "report.pending.json");
  const destination = resolve(directory, "report.json");
  writeFileSync(pending, `${JSON.stringify(report, null, 2)}\n`, {
    flag: "wx",
  });
  renameSync(pending, destination);
  return destination;
}

async function run(values) {
  if (!values.context || !values["evidence-dir"])
    throw new Error("Run requires --context and --evidence-dir");
  const root = repository(values.root);
  const expected = readContext(values.context);
  const evidence = evidenceDirectory(root, values["evidence-dir"]);
  const plan = values.plan
    ? JSON.parse(readFileSync(values.plan, "utf8"))
    : verificationProfile(values.profile);
  const label = values.label ?? "candidate";
  if (!/^[a-zA-Z0-9_-]+$/.test(label))
    throw new Error(
      "Label must contain letters, digits, underscores or hyphens",
    );
  mkdirSync(evidence, { recursive: true });
  const directory = resolve(evidence, `${label}-${randomUUID()}`);
  mkdirSync(directory);
  const report = {
    version: 1,
    label,
    root,
    startedAt: new Date().toISOString(),
    profile: plan.name,
    profileFingerprint: digest(JSON.stringify(plan)),
    context: expected,
    steps: [],
    status: "incomplete",
    exitCode: 2,
    node: process.version,
    runnerFingerprint: digest(readFileSync(fileURLToPath(import.meta.url))),
    rerun: {
      context: resolve(directory, "context.json"),
      plan: resolve(directory, "plan.json"),
    },
  };
  writeFileSync(
    resolve(directory, "context.json"),
    `${JSON.stringify(expected, null, 2)}\n`,
  );
  const publicPlan = JSON.parse(JSON.stringify(plan));
  for (const phase of ["preflight", "builds", "checks"]) {
    for (const command of publicPlan[phase] ?? []) {
      if (command.env)
        command.env = Object.fromEntries(
          Object.keys(command.env).map((key) => [key, "<supply at rerun>"]),
        );
    }
  }
  writeFileSync(
    resolve(directory, "plan.json"),
    `${JSON.stringify(publicPlan, null, 2)}\n`,
  );
  const deadline = performance.now() + Number(values["deadline-ms"]);
  let phase = "preflight";
  try {
    if (Number(process.versions.node.split(".")[0]) < 24)
      throw new Error("Node 24 or newer is required");
    validatePlan(plan, root, expected);
    checkContext(root, expected, deadline);
    for (const path of plan.prerequisites ?? []) {
      if (!existsSync(checkoutPath(root, path)))
        throw new Error(
          `Missing prerequisite ${path}. Install workspace dependencies first.`,
        );
    }
    for (const command of [...plan.preflight, ...plan.builds, ...plan.checks])
      executable(command, root);
    for (phase of ["preflight", "builds", "checks"]) {
      if (phase === "checks") {
        report.outputs = [];
        for (const path of [
          ...new Set([...(plan.outputs ?? []), ...expected.requiredOutputs]),
        ]) {
          const absolute = checkoutPath(root, path);
          if (!existsSync(absolute) || !statSync(absolute).isFile()) {
            report.status = "missing-output";
            throw new Error(`Missing required output ${path}`);
          }
          report.outputs.push({ path, sha256: digest(readFileSync(absolute)) });
        }
      }
      for (const [index, command] of plan[phase].entries()) {
        checkContext(root, expected, deadline);
        if (performance.now() >= deadline) {
          report.status = "timeout";
          report.exitCode = 124;
          throw new Error(
            "Verification deadline expired before the next command",
          );
        }
        const step = await execute(
          command,
          root,
          resolve(directory, `${phase}-${index}`),
          deadline,
        );
        report.steps.push({
          phase,
          argv: command.argv,
          cwd: command.cwd ?? ".",
          timeoutMs: command.timeoutMs,
          ...step,
        });
        const code = exitFor(step);
        if (code !== 0) {
          report.status =
            step.outcome === "timeout"
              ? "timeout"
              : step.outcome === "interrupted"
                ? "interrupted"
                : phase === "preflight"
                  ? "prerequisite-failed"
                  : phase === "builds"
                    ? "build-failed"
                    : "failed";
          report.exitCode = code;
          throw new Error(
            `${phase} command failed with ${step.outcome}; see ${step.stderr}`,
          );
        }
      }
    }
    checkContext(root, expected, deadline);
    remainingTime(deadline);
    report.status = "passed";
    report.exitCode = 0;
  } catch (error) {
    report.error = error.message;
    if (error.code === "VERIFICATION_TIMEOUT") {
      report.status = "timeout";
      report.exitCode = 124;
    }
    if (report.status === "incomplete")
      report.status =
        phase === "checks" ? "invalid-source-or-output" : "prerequisite-failed";
  }
  report.completedAt = new Date().toISOString();
  const reportPath = writeReport(directory, report);
  console.log(
    JSON.stringify({
      status: report.status,
      exitCode: report.exitCode,
      report: reportPath,
    }),
  );
  return report.exitCode;
}

function compare(values) {
  if (!values.baseline || !values.candidate || !values["evidence-dir"])
    throw new Error(
      "Compare requires --baseline, --candidate and --evidence-dir",
    );
  const baseline = JSON.parse(readFileSync(values.baseline, "utf8"));
  const candidate = JSON.parse(readFileSync(values.candidate, "utf8"));
  for (const report of [baseline, candidate]) {
    if (
      report.version !== 1 ||
      !report.completedAt ||
      !Number.isInteger(report.exitCode) ||
      !report.context?.fingerprint
    )
      throw new Error("Comparison requires finalized verification reports");
  }
  if (
    baseline.profile !== candidate.profile ||
    baseline.profileFingerprint !== candidate.profileFingerprint
  )
    throw new Error("Reports must use the same resolved verification plan");
  const evidence = evidenceDirectory(
    repository(values.root),
    values["evidence-dir"],
  );
  mkdirSync(evidence, { recursive: true });
  const directory = resolve(evidence, `comparison-${randomUUID()}`);
  mkdirSync(directory);
  const result = {
    version: 1,
    completedAt: new Date().toISOString(),
    baseline,
    candidate,
    status:
      baseline.exitCode === 0 && candidate.exitCode === 0
        ? "passed"
        : "different-or-failed",
    exitCode: baseline.exitCode === 0 && candidate.exitCode === 0 ? 0 : 1,
  };
  console.log(
    JSON.stringify({
      status: result.status,
      report: writeReport(directory, result),
    }),
  );
  return result.exitCode;
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      root: { type: "string", default: process.cwd() },
      context: { type: "string" },
      profile: { type: "string", default: "tooling" },
      plan: { type: "string" },
      "evidence-dir": { type: "string" },
      label: { type: "string" },
      "deadline-ms": { type: "string", default: "3600000" },
      baseline: { type: "string" },
      candidate: { type: "string" },
      help: { type: "boolean" },
    },
  });
  if (values.help) {
    console.log(
      "verify-task.mjs run --root PATH --context FILE --profile tooling|cli-runtime|subgraph|reactor-pg --evidence-dir DIR [--label baseline|candidate]\nverify-task.mjs compare --root PATH --baseline REPORT --candidate REPORT --evidence-dir DIR\nUse --plan FILE for a task-specific JSON plan. Commands run serially without a shell.",
    );
    return 0;
  }
  if (
    !Number.isSafeInteger(Number(values["deadline-ms"])) ||
    Number(values["deadline-ms"]) <= 0
  )
    throw new Error("--deadline-ms must be a positive integer");
  if (positionals.length !== 1)
    throw new Error("Choose run or compare; use --help for usage");
  if (positionals[0] === "run") return run(values);
  if (positionals[0] === "compare") return compare(values);
  throw new Error("Choose run or compare");
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 2;
    });
}
