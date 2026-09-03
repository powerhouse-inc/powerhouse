import { spawnSync } from "node:child_process";
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import type { CommandResult } from "../records/records-commands.js";
import { checkPackage, listWorkspacePackages } from "./fix-dist.js";
import type { WorkspacePackage } from "./fix-dist.js";
import { FIX_EXIT } from "./fix-options.js";
import type { CiOptions } from "./fix-options.js";
import {
  git,
  nonEmptyLines,
  POSTGRES_PORT,
  POSTGRES_URL,
  probePort,
  repoRoot,
} from "./repo.js";

export type CiStep = {
  id: string;
  label: string;
  command: string[];
  env: Record<string, string>;
  /** A red here makes the later steps meaningless, so they are skipped. */
  blocking: boolean;
};

export type StepOutcome = {
  step: CiStep;
  exit: number | null;
  signal: string | null;
  seconds: number;
  log: string;
  skipped: boolean;
  tail: string[];
};

export type PlanInput = {
  changed: string[];
  owners: string[];
  stale: string[];
  integration: boolean;
  postgres: boolean;
};

export type Coverage = {
  changed: string[];
  owners: string[];
  rebuilt: string[];
  reactorTouched: boolean;
  postgres: boolean;
  integration: boolean;
  notRun: string[];
};

export type CiSummary = {
  exit: number;
  root: string;
  logDir: string;
  startedAt: string;
  finishedAt: string;
  coverage: Coverage;
  steps: {
    id: string;
    label: string;
    command: string;
    exit: number | null;
    seconds: number;
    log: string;
    skipped: boolean;
  }[];
};

const REACTOR_PATHS = [
  "packages/reactor/",
  "packages/reactor-api/",
  "test/test-connect/",
  "test/test-client/",
];

const LINTABLE = /\.[cm]?[jt]sx?$/;

export function touchesReactor(changed: string[]): boolean {
  return changed.some((path) =>
    REACTOR_PATHS.some((prefix) => path.startsWith(prefix)),
  );
}

/** Untracked, unstaged, staged, and committed since main: what check-commit would see. */
export function collectChanged(root: string): string[] {
  const paths = new Set<string>();
  for (const line of nonEmptyLines(
    git(["status", "--porcelain", "--untracked-files=all"], root).stdout,
  )) {
    const path = line.slice(3).trim();
    const renamed = path.split(" -> ");
    paths.add(renamed[renamed.length - 1]);
  }
  const base = git(["merge-base", "HEAD", "main"], root);
  if (base.status === 0) {
    for (const path of nonEmptyLines(
      git(["diff", "--name-only", base.stdout.trim(), "HEAD"], root).stdout,
    )) {
      paths.add(path);
    }
  }
  return [...paths].filter((path) => existsSync(join(root, path))).sort();
}

export function owningPackage(
  root: string,
  packages: WorkspacePackage[],
  file: string,
): string | undefined {
  const absolute = resolve(root, file);
  let best: WorkspacePackage | undefined;
  for (const pkg of packages) {
    const rel = relative(pkg.path, absolute);
    if (rel.startsWith("..") || rel === "") {
      continue;
    }
    if (best === undefined || pkg.path.length > best.path.length) {
      best = pkg;
    }
  }
  return best?.name;
}

export function planCi(input: PlanInput): CiStep[] {
  const steps: CiStep[] = [];
  const toBuild = [...new Set([...input.owners, ...input.stale])].sort();
  steps.push({
    id: "ts-references",
    label: "tsconfig refs",
    command: ["pnpm", "check-ts-references"],
    env: {},
    blocking: false,
  });
  if (toBuild.length > 0) {
    steps.push({
      id: "build",
      label: "Build (owning + stale)",
      command: [
        "pnpm",
        ...toBuild.map((name) => `--filter=${name}`),
        "run",
        "build",
      ],
      env: {},
      blocking: true,
    });
  }
  steps.push({
    id: "typecheck",
    label: "Typecheck",
    command: ["pnpm", "typecheck"],
    env: {},
    blocking: true,
  });
  steps.push({
    id: "rebuild",
    label: "Re-link workspace bins",
    command: ["pnpm", "rebuild", "--recursive"],
    env: {},
    blocking: false,
  });
  steps.push({
    id: "versioned-documents",
    label: "Generated-binary consumers",
    command: [
      "pnpm",
      "--filter=@powerhousedao/versioned-documents",
      "--no-bail",
      "run",
      "build",
    ],
    env: {},
    blocking: false,
  });
  const lintable = input.changed.filter((path) => LINTABLE.test(path));
  if (lintable.length > 0) {
    steps.push({
      id: "eslint",
      label: "Lint (changed files)",
      command: [
        "pnpm",
        "eslint",
        "--config",
        "eslint.config.js",
        "--quiet",
        "--no-error-on-unmatched-pattern",
        ...lintable,
      ],
      env: { NODE_OPTIONS: "--max-old-space-size=8192" },
      blocking: false,
    });
  }
  steps.push({
    id: "test-ci",
    label: "Tests (test:ci related)",
    command: [
      "pnpm",
      "test:ci",
      "--",
      "--silent",
      "passed-only",
      "related",
      ...input.changed,
    ],
    env: {},
    blocking: false,
  });
  steps.push({
    id: "circular",
    label: "Circular imports",
    command: ["pnpm", "check-circular-imports"],
    env: {},
    blocking: false,
  });
  if (touchesReactor(input.changed)) {
    steps.push({
      id: "reactor-lint",
      label: "Reactor lint",
      command: ["pnpm", "--filter=@powerhousedao/reactor", "run", "lint"],
      env: {},
      blocking: false,
    });
    steps.push({
      id: "test-reactor",
      label: input.postgres
        ? "Reactor suite (with PG variants)"
        : "Reactor suite (PG variants NOT run)",
      command: ["pnpm", "test:reactor"],
      env: input.postgres ? { REACTOR_TEST_PG_URL: POSTGRES_URL } : {},
      blocking: false,
    });
    if (input.integration) {
      steps.push({
        id: "test-integration",
        label: "Sync integration",
        command: ["pnpm", "test:integration"],
        env: {},
        blocking: false,
      });
    }
  }
  return steps;
}

function tailOf(path: string, count: number): string[] {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return [];
  }
  const lines = raw.split("\n");
  return lines.slice(Math.max(0, lines.length - count));
}

export function runStep(step: CiStep, root: string, log: string): StepOutcome {
  const fd = openSync(log, "w");
  const started = Date.now();
  let result: ReturnType<typeof spawnSync>;
  try {
    result = spawnSync(step.command[0], step.command.slice(1), {
      cwd: root,
      stdio: ["ignore", fd, fd],
      env: { ...process.env, CI: "true", FORCE_COLOR: "0", ...step.env },
    });
  } finally {
    closeSync(fd);
  }
  const seconds = (Date.now() - started) / 1000;
  if (result.error !== undefined) {
    writeFileSync(log, `${result.error.message}\n`, { flag: "a" });
  }
  const exit = result.error === undefined ? result.status : FIX_EXIT.error;
  return {
    step,
    exit,
    signal: result.signal,
    seconds,
    log,
    skipped: false,
    tail: exit === 0 ? [] : tailOf(log, 40),
  };
}

function commandLine(step: CiStep): string {
  const env = Object.entries(step.env)
    .map(([key, value]) => `${key}=${value}`)
    .join(" ");
  const command = step.command
    .map((part) => (part.includes(" ") ? JSON.stringify(part) : part))
    .join(" ");
  return env === "" ? command : `${env} ${command}`;
}

function outcomeWord(outcome: StepOutcome): string {
  if (outcome.skipped) {
    return "skipped";
  }
  return outcome.exit === 0 ? "pass" : "FAIL";
}

export function formatCiReport(
  outcomes: StepOutcome[],
  coverage: Coverage,
  summaryPath: string,
): string[] {
  const lines = [
    "| # | Check | Command | Exit | Seconds | Result |",
    "|---|-------|---------|------|---------|--------|",
  ];
  outcomes.forEach((outcome, index) => {
    lines.push(
      `| ${String(index + 1)} | ${outcome.step.label} | \`${commandLine(outcome.step)}\` | ${outcome.skipped ? "-" : String(outcome.exit)} | ${outcome.seconds.toFixed(0)} | ${outcomeWord(outcome)} |`,
    );
  });
  for (const outcome of outcomes) {
    if (outcome.skipped || outcome.exit === 0) {
      continue;
    }
    lines.push("");
    lines.push(
      `### ${outcome.step.label} exited ${String(outcome.exit)}${outcome.signal === null ? "" : ` on ${outcome.signal}`} (${outcome.log})`,
    );
    lines.push("```");
    lines.push(...outcome.tail);
    lines.push("```");
  }
  lines.push("");
  lines.push("Coverage:");
  lines.push(
    `- changed (${String(coverage.changed.length)}): ${coverage.changed.join(", ")}`,
  );
  lines.push(`- owning packages: ${coverage.owners.join(", ") || "none"}`);
  lines.push(
    `- rebuilt before testing: ${coverage.rebuilt.join(", ") || "none"}`,
  );
  lines.push(
    coverage.reactorTouched
      ? coverage.postgres
        ? `- reactor suite ran with Postgres on ${String(POSTGRES_PORT)}; PG variants executed`
        : `- reactor suite ran WITHOUT Postgres on ${String(POSTGRES_PORT)}; PG variants not run - PARTIAL`
      : "- reactor paths untouched; reactor suite and integration not in scope",
  );
  lines.push(
    coverage.integration
      ? "- pnpm test:integration ran"
      : "- pnpm test:integration not run",
  );
  lines.push(`- not run: ${coverage.notRun.join("; ")}`);
  lines.push(`- summary: ${summaryPath}`);
  return lines;
}

function writeAtomically(path: string, content: string): void {
  const temp = `${path}.tmp`;
  writeFileSync(temp, content);
  renameSync(temp, path);
}

export async function runCi(options: CiOptions): Promise<CommandResult> {
  const root = repoRoot();
  const startedAt = new Date();
  const logDir =
    options.out === ""
      ? join(
          tmpdir(),
          "bench-fix-ci",
          startedAt.toISOString().replace(/[:.]/g, "-"),
        )
      : resolve(options.out);
  mkdirSync(logDir, { recursive: true });
  const summaryPath = join(logDir, "summary.json");
  const reportPath = join(logDir, "report.md");
  console.log(`summary: ${summaryPath}`);
  console.log(`logs: ${logDir}`);

  const changed =
    options.changed.length > 0
      ? options.changed.map((path) => relative(root, resolve(root, path)))
      : collectChanged(root);
  if (changed.length === 0) {
    const lines = [
      "no changes to verify; CI skips lint and tests on an empty diff",
    ];
    writeAtomically(
      summaryPath,
      `${JSON.stringify({ exit: FIX_EXIT.ok, root, logDir, changed, steps: [] }, null, 2)}\n`,
    );
    return {
      exit: FIX_EXIT.ok,
      lines,
      data: { changed, summary: summaryPath },
    };
  }

  const packages = listWorkspacePackages(root);
  const owners = [
    ...new Set(
      changed
        .map((path) => owningPackage(root, packages, path))
        .filter((name): name is string => name !== undefined),
    ),
  ].sort();
  const stale = packages
    .map(checkPackage)
    .filter((status) => status.verdict === "stale")
    .map((status) => status.name);
  const postgres = await probePort("localhost", POSTGRES_PORT, 1500);
  const reactorTouched = touchesReactor(changed);

  const steps = planCi({
    changed,
    owners,
    stale,
    integration: options.integration,
    postgres,
  });
  console.log(
    `plan: ${String(steps.length)} steps; owners ${owners.join(", ") || "none"}; stale ${stale.join(", ") || "none"}; postgres ${postgres ? "reachable" : "unreachable"}`,
  );

  const outcomes: StepOutcome[] = [];
  let blocked = false;
  steps.forEach((step, index) => {
    const log = join(
      logDir,
      `${String(index + 1).padStart(2, "0")}-${step.id}.log`,
    );
    if (blocked) {
      outcomes.push({
        step,
        exit: null,
        signal: null,
        seconds: 0,
        log,
        skipped: true,
        tail: [],
      });
      return;
    }
    console.log(`running ${step.label}: ${commandLine(step)}`);
    const outcome = runStep(step, root, log);
    console.log(
      `  -> exit ${String(outcome.exit)} in ${outcome.seconds.toFixed(0)}s`,
    );
    outcomes.push(outcome);
    if (step.blocking && outcome.exit !== 0) {
      blocked = true;
    }
  });

  const coverage: Coverage = {
    changed,
    owners,
    rebuilt: [...new Set([...owners, ...stale])].sort(),
    reactorTouched,
    postgres,
    integration: options.integration && reactorTouched,
    notRun: [
      "full pnpm build (scoped to owning and stale packages)",
      "storybook build",
      "browser-project suites outside test:ci related",
      ...(reactorTouched && !options.integration
        ? ["pnpm test:integration (pass --integration)"]
        : []),
    ],
  };
  const red = outcomes.some(
    (outcome) => !outcome.skipped && outcome.exit !== 0,
  );
  const exit = red ? FIX_EXIT.red : FIX_EXIT.ok;
  const lines = formatCiReport(outcomes, coverage, summaryPath);
  const summary: CiSummary = {
    exit,
    root,
    logDir,
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    coverage,
    steps: outcomes.map((outcome) => ({
      id: outcome.step.id,
      label: outcome.step.label,
      command: commandLine(outcome.step),
      exit: outcome.exit,
      seconds: outcome.seconds,
      log: outcome.log,
      skipped: outcome.skipped,
    })),
  };
  writeFileSync(reportPath, `${lines.join("\n")}\n`);
  writeAtomically(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
  return {
    exit,
    lines,
    data: { summary: summaryPath, report: reportPath, ...summary },
  };
}

export function summaryDirname(path: string): string {
  return dirname(path);
}
