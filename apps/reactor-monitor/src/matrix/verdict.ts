import {
  CHECKS,
  MATRIX_STAGES,
  outcomeSchema,
  type Cell,
  type CheckName,
  type CheckResult,
  type Expectation,
  type MatrixDefinition,
  type MatrixIssue,
  type Outcome,
  type Rep,
  type RepOutcome,
  type Summary,
  type UnavailableReason,
} from "./schema.js";

export type PlannedCheck = {
  name: CheckName;
  operator: boolean;
  unavailable?: UnavailableReason;
};

/** Under enforced credentials the operator checks are unavailable. */
export function plannedChecks(
  definition: Pick<MatrixDefinition, "checks" | "credentialVerification">,
): PlannedCheck[] {
  return CHECKS.filter((check) => definition.checks.includes(check.name)).map(
    ({ name, operator }) =>
      operator && definition.credentialVerification === "enforced"
        ? { name, operator, unavailable: "credential-verification-enforced" }
        : { name, operator },
  );
}

export function unavailableResult(
  check: PlannedCheck,
): CheckResult | undefined {
  return check.unavailable
    ? { name: check.name, status: "unavailable", reason: check.unavailable }
    : undefined;
}

const ENGINE_STAGES = new Set<string>(MATRIX_STAGES);

export function classifyIssues(
  issues: readonly MatrixIssue[],
): "invalid-static" | "invalid-boot" | undefined {
  if (issues.length === 0) return undefined;
  if (issues.some((issue) => ENGINE_STAGES.has(issue.stage))) {
    return "invalid-static";
  }
  return issues.some((issue) => issue.stage === "boot")
    ? "invalid-boot"
    : "invalid-static";
}

export function repOutcome(
  rep: Pick<Rep, "checks" | "error" | "spawnFailed">,
  expect: Expectation,
): RepOutcome {
  if (rep.error) return "error";
  if (expect === "refusal") return rep.spawnFailed ? "pass" : "fail";
  if (rep.spawnFailed) return "fail";
  if (rep.checks.some((check) => check.status === "fail")) return "fail";
  if (rep.checks.some((check) => check.status === "unavailable")) {
    return "inconclusive";
  }
  return "pass";
}

function repReason(rep: Rep, outcome: RepOutcome, expect: Expectation): string {
  const tag = `rep ${rep.rep}`;
  if (outcome === "error") return `${tag}: ${rep.error?.message ?? "error"}`;
  if (expect === "refusal") {
    return outcome === "pass"
      ? "refused at boot, as expected"
      : `${tag}: started though a refusal was expected`;
  }
  if (rep.spawnFailed) return `${tag}: did not start after a clean check`;
  const failed = rep.checks.find((check) => check.status === "fail");
  if (failed) {
    return `${tag}: ${failed.name} failed${failed.detail ? `: ${failed.detail}` : ""}`;
  }
  const unavailable = rep.checks
    .filter((check) => check.status === "unavailable")
    .map((check) => check.name);
  return `inconclusive — credential verification enforced: ${unavailable.join(", ")} unavailable`;
}

// A failure outranks a harness error; both outrank missing checks.
const PRECEDENCE: readonly RepOutcome[] = [
  "fail",
  "error",
  "inconclusive",
  "pass",
];

export type Verdict = { outcome: Outcome; reason?: string; flaky: boolean };

/** Static issues decide first; otherwise the finished reps do. */
export function cellVerdict(
  cell: Pick<Cell, "expect" | "issues" | "reps"> & { skip?: string },
): Verdict {
  if (cell.skip !== undefined) {
    return { outcome: "skipped-constraint", reason: cell.skip, flaky: false };
  }
  const invalid = classifyIssues(cell.issues);
  if (invalid) {
    const first = cell.issues[0];
    const authored = cell.issues.some((issue) =>
      ENGINE_STAGES.has(issue.stage),
    );
    if (cell.expect === "refusal" && !authored) {
      return {
        outcome: "pass",
        reason: `refused at ${first.stage}, as expected: ${first.message}`,
        flaky: false,
      };
    }
    return { outcome: invalid, reason: first.message, flaky: false };
  }
  const finished = cell.reps.flatMap((rep) =>
    rep.status === "done"
      ? [{ rep, outcome: rep.outcome ?? repOutcome(rep, cell.expect) }]
      : [],
  );
  if (finished.length === 0) {
    return { outcome: "error", reason: "no repetition finished", flaky: false };
  }
  const outcome = PRECEDENCE.find((candidate) =>
    finished.some((entry) => entry.outcome === candidate),
  )!;
  const decisive = finished.find((entry) => entry.outcome === outcome)!;
  const settled = new Set(
    finished.map((entry) => entry.outcome).filter((o) => o !== "error"),
  );
  const reason =
    outcome === "pass" && cell.expect === "accept"
      ? undefined
      : repReason(decisive.rep, outcome, cell.expect);
  return { outcome, reason, flaky: settled.size > 1 };
}

export function summarize(
  cells: readonly Pick<Cell, "status" | "outcome" | "flaky">[],
): Summary {
  const outcomes = Object.fromEntries(
    outcomeSchema.options.map((outcome) => [outcome, 0]),
  ) as Record<Outcome, number>;
  let done = 0;
  let flaky = 0;
  for (const cell of cells) {
    if (cell.status === "done") done += 1;
    if (cell.flaky) flaky += 1;
    if (cell.outcome) outcomes[cell.outcome] += 1;
  }
  return { total: cells.length, done, flaky, outcomes };
}
