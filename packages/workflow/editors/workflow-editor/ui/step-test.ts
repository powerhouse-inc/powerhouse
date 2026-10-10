// Reads the runtime's step-test refusals, so the panel can point at the block
// the author has to fix first.

// Where a refusal sends the author: a step by key, the trigger or the variables.
export type TestErrorTarget =
  | { kind: "step"; key: string }
  | { kind: "trigger" }
  | { kind: "variables" };

export interface TestErrorExplained {
  message: string;
  targets: TestErrorTarget[];
}

const UPSTREAM = /^Test "(.+?)" first(?::|$)/;
const TRIGGER = /^Test the trigger first(?::|$)/;
const REDACTED = /^"(.+?)" reads a value redacted from the last test of (.+)$/;
const VARIABLE = /^(?:Secret variable|Variable) "(.+?)" /;
const QUOTED = /"([^"]+)"/g;

// A redaction names its sources as `"j"`, `"j", "k"` or `the trigger`.
function sourcesOf(list: string): TestErrorTarget[] {
  const targets: TestErrorTarget[] = [...list.matchAll(QUOTED)].map(
    (match) => ({ kind: "step", key: match[1] }),
  );
  if (/\bthe trigger\b/.test(list)) targets.unshift({ kind: "trigger" });
  return targets;
}

export function explainTestError(error: string): TestErrorExplained {
  const upstream = UPSTREAM.exec(error);
  if (upstream) {
    return { message: error, targets: [{ kind: "step", key: upstream[1] }] };
  }
  if (TRIGGER.test(error)) {
    return { message: error, targets: [{ kind: "trigger" }] };
  }
  const redacted = REDACTED.exec(error);
  if (redacted) {
    return { message: error, targets: sourcesOf(redacted[2]) };
  }
  if (VARIABLE.test(error)) {
    return { message: error, targets: [{ kind: "variables" }] };
  }
  return { message: error, targets: [] };
}

// How the panel shows a step test's outcome.
export type TestOutcomeView = "output" | "failed" | "indeterminate";

// INDETERMINATE: a write the step asked for may have landed, so it is shown
// as neither a pass nor a failure. Anything unknown is not a pass either.
export function testOutcomeView(status: string): TestOutcomeView {
  if (status === "SUCCEEDED") return "output";
  if (status === "INDETERMINATE") return "indeterminate";
  return "failed";
}
