import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const GUARD = join(
  import.meta.dirname,
  "..",
  "..",
  "..",
  "..",
  ".claude",
  "hooks",
  "records-guard.sh",
);

type GuardResult = { exit: number; message: string };

/** Exit 2 blocks the call and hands stderr back to the agent as feedback. */
function guard(role: string, command: string): GuardResult {
  const payload = JSON.stringify({
    tool_name: "Bash",
    tool_input: { command },
  });
  try {
    execFileSync(GUARD, [role], {
      input: payload,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
  } catch (error) {
    const failure = error as { status: number; stderr: string };
    return { exit: failure.status, message: failure.stderr.trim() };
  }
  return { exit: 0, message: "" };
}

const PNPM = "pnpm --filter @powerhousedao/reactor";
const PIPELINE = `set -o pipefail; ${PNPM} bench:records:from-vitest auth | ${PNPM} bench:records add-benchmark - --dir bench --json`;

describe("every role", () => {
  it("never lets a record file be written by anything but the CLI", () => {
    const writes = [
      "echo x > packages/reactor/bench/TASKS.jsonl",
      "echo x >> packages/reactor/bench/BENCHMARKS.jsonl",
      "sed -i '' 's/a/b/' packages/reactor/bench/TASKS.jsonl",
      "rm packages/reactor/bench/TASKS.jsonl",
      "mv /tmp/x packages/reactor/bench/TASKS.jsonl",
      "cat /tmp/x | tee packages/reactor/bench/TASKS.jsonl",
      "truncate -s 0 packages/reactor/bench/BENCHMARKS.jsonl",
    ];

    for (const command of writes) {
      expect(guard("none", command).exit, command).toBe(2);
    }
  });

  it("leaves reading alone, including a read that redirects elsewhere", () => {
    const reads = [
      "grep DEFECT packages/reactor/bench/TASKS.jsonl > /tmp/hits",
      "jq -r '.id' packages/reactor/bench/BENCHMARKS.jsonl | head -5",
      "wc -l packages/reactor/bench/TASKS.jsonl",
    ];

    for (const command of reads) {
      expect(guard("none", command).exit, command).toBe(0);
    }
  });

  it("refuses to touch the lock, because a stale one means a writer died", () => {
    const lock = "packages/reactor/bench/.records.lock";

    for (const command of [
      `rm ${lock}`,
      `mv ${lock} /tmp/x`,
      `touch ${lock}`,
    ]) {
      expect(guard("none", command).exit, command).toBe(2);
    }
  });

  it("lets the lock be named by a command that does not act on it", () => {
    // The first version matched any mention, which blocked writing the
    // documentation that explains the rule - found by it blocking exactly that.
    const lock = "packages/reactor/bench/.records.lock";

    for (const command of [`ls -la ${lock}`, `echo "never remove ${lock}"`]) {
      expect(guard("none", command).exit, command).toBe(0);
    }
  });

  it("leaves a human free to write wherever they are testing", () => {
    // ROLE=none also runs against the main thread. Scratch directories, chosen
    // ids and shell plumbing are agent discipline, not file integrity, so they
    // belong to the roles - the plan verification step itself needs a scratch
    // directory, and blocking it here would make the tool untestable by hand.
    const human = [
      `${PNPM} bench:records add-benchmark - --dir /tmp/scratch`,
      `${PNPM} bench:records add-task - --dir bench --id T-009`,
      `${PNPM} bench:records show B-001`,
    ];

    for (const command of human) {
      expect(guard("none", command).exit, command).toBe(0);
    }
  });

  it("leaves the main thread's own git alone", () => {
    // ROLE=none is the project-wide layer, so it also runs against the human's
    // session. Blocking git there would break the workflow it is meant to
    // protect, so the git rule belongs to the agent roles.
    expect(guard("none", "git commit -m x").exit).toBe(0);
    expect(guard("none", "git push").exit).toBe(0);
  });

  it("blocks a Bash call whose command it cannot read", () => {
    const payload = JSON.stringify({ tool_name: "Bash", tool_input: {} });
    try {
      execFileSync(GUARD, ["none"], { input: payload, encoding: "utf8" });
      throw new Error("Expected the guard to block");
    } catch (error) {
      expect((error as { status: number }).status).toBe(2);
    }
  });

  it("refuses a role it does not know rather than allowing the call", () => {
    expect(guard("bogus", "echo hi").exit).toBe(2);
  });
});

describe("every agent role", () => {
  it("keeps the record literal in the transcript", () => {
    for (const role of ["runner", "analyst", "verifier"]) {
      expect(
        guard(
          role,
          `${PNPM} bench:records show B-001 --dir bench $(cat /tmp/x)`,
        ).exit,
        role,
      ).toBe(2);
    }
  });

  it("allocates ids rather than accepting one", () => {
    for (const role of ["runner", "analyst", "verifier"]) {
      expect(
        guard(role, `${PNPM} bench:records add-task - --dir bench --id T-009`)
          .exit,
        role,
      ).toBe(2);
    }
  });

  it("makes every mutating call name the directory it wrote to", () => {
    expect(
      guard("analyst", `${PNPM} bench:records add-task - --dir /tmp/scratch`)
        .exit,
    ).toBe(2);
  });

  it("keeps bench:record to the runner, since it appends without add-benchmark", () => {
    // The wrapper carries no add-benchmark verb, so the verb-ownership rules
    // do not see it. Without its own check it would let either reading role
    // record a run.
    const command = `${PNPM} bench:record auth`;

    expect(guard("runner", command).exit).toBe(0);
    expect(guard("analyst", command).exit).toBe(2);
    expect(guard("verifier", command).exit).toBe(2);
  });

  it("still lets a reading role run a benchmark without recording it", () => {
    // The verifier reproduces findings by re-running benchmarks; only the
    // appending is the runner's.
    for (const role of ["analyst", "verifier"]) {
      expect(guard(role, `${PNPM} bench:auth:record`).exit, role).toBe(0);
    }
  });

  it("leaves committing to the human", () => {
    for (const role of ["runner", "analyst", "verifier"]) {
      expect(guard(role, "git commit -m x").exit, role).toBe(2);
      expect(guard(role, "git push").exit, role).toBe(2);
      expect(guard(role, "git checkout -- .").exit, role).toBe(2);
    }
  });
});

describe("bench-runner", () => {
  it("accepts the one pipeline it is allowed", () => {
    expect(guard("runner", PIPELINE).exit).toBe(0);
    expect(
      guard(
        "runner",
        `set -o pipefail; ${PNPM} bench:sync:record | ${PNPM} bench:records add-benchmark - --dir bench --json`,
      ).exit,
    ).toBe(0);
    expect(guard("runner", `${PNPM} bench:auth:record`).exit).toBe(0);
  });

  it("insists on pipefail, without which a crashed adapter records nothing at exit 0", () => {
    const result = guard("runner", PIPELINE.replace("set -o pipefail; ", ""));

    expect(result.exit).toBe(2);
    expect(result.message).toContain("pipefail");
  });

  it("refuses a record it assembled itself", () => {
    expect(
      guard(
        "runner",
        `set -o pipefail; echo '{}' | ${PNPM} bench:records add-benchmark - --dir bench`,
      ).exit,
    ).toBe(2);
  });

  it("refuses to put its own prose in the record", () => {
    const result = guard(
      "runner",
      PIPELINE.replace("auth |", "auth --conclusion 'it is slow' |"),
    );

    expect(result.exit).toBe(2);
    expect(result.message).toContain("come from the numbers");
  });

  it("refuses to record against a tree whose sha would be a lie", () => {
    const result = guard(
      "runner",
      PIPELINE.replace("auth |", "auth --allow-dirty |"),
    );

    expect(result.exit).toBe(2);
    expect(result.message).toContain("code that did not run");
  });

  it("files nothing and judges nothing", () => {
    expect(
      guard("runner", `${PNPM} bench:records add-task - --dir bench`).exit,
    ).toBe(2);
    expect(
      guard(
        "runner",
        `${PNPM} bench:records set-status T-001 VERIFIED --dir bench`,
      ).exit,
    ).toBe(2);
  });
});

describe("bench-analyst", () => {
  const task = (kind: string, evidence: string) =>
    `${PNPM} bench:records add-task - --dir bench <<'JSON'\n{"kind": "${kind}", ${evidence}}\nJSON`;

  it("files a defect that cites the run which showed it", () => {
    expect(guard("analyst", task("DEFECT", '"evidence": ["B-001"]')).exit).toBe(
      0,
    );
  });

  it("refuses a defect with nothing behind it", () => {
    const result = guard("analyst", task("DEFECT", '"priority": 1'));

    expect(result.exit).toBe(2);
    expect(result.message).toContain("B-nnn");
  });

  it("lets a harness finding stand without a run, because it is about the apparatus", () => {
    expect(guard("analyst", task("HARNESS", '"priority": 1')).exit).toBe(0);
  });

  it("insists the finding is literal in the transcript", () => {
    expect(
      guard(
        "analyst",
        `${PNPM} bench:records add-task /tmp/task.json --dir bench`,
      ).exit,
    ).toBe(2);
  });

  it("records nothing and judges nothing", () => {
    expect(guard("analyst", PIPELINE).exit).toBe(2);
    expect(
      guard(
        "analyst",
        `${PNPM} bench:records set-status T-001 VERIFIED --dir bench`,
      ).exit,
    ).toBe(2);
  });
});

describe("bench-verifier", () => {
  const status = (verdict: string, tail: string) =>
    `${PNPM} bench:records set-status T-001 ${verdict} --dir bench ${tail}`;

  it("accepts a verdict backed by a run", () => {
    expect(
      guard(
        "verifier",
        status(
          "VERIFIED",
          "--note 'ran the repro' --evidence B-001 --by bench-verifier",
        ),
      ).exit,
    ).toBe(0);
    expect(
      guard(
        "verifier",
        status(
          "REFUTED",
          "--note 'the repro shows expected' --evidence B-001 --by bench-verifier",
        ),
      ).exit,
    ).toBe(0);
  });

  it("lets could-not-reproduce restate UNVERIFIED without a run", () => {
    expect(
      guard(
        "verifier",
        status(
          "UNVERIFIED",
          "--note 'could not reproduce' --by bench-verifier",
        ),
      ).exit,
    ).toBe(0);
  });

  it("refuses the two statuses that belong to whoever changes the code", () => {
    expect(
      guard("verifier", status("FIXED", "--note x --evidence B-001")).exit,
    ).toBe(2);
    expect(
      guard("verifier", status("COMMITTED", "--note x --evidence B-001")).exit,
    ).toBe(2);
  });

  it("refuses a verdict with no note and a VERIFIED with no evidence", () => {
    expect(
      guard(
        "verifier",
        status("VERIFIED", "--evidence B-001 --by bench-verifier"),
      ).exit,
    ).toBe(2);
    expect(
      guard("verifier", status("VERIFIED", "--note x --by bench-verifier"))
        .exit,
    ).toBe(2);
  });

  it("signs the verdict, so the loop can tell who reached it", () => {
    const result = guard(
      "verifier",
      status("VERIFIED", "--note x --evidence B-001"),
    );

    expect(result.exit).toBe(2);
    expect(result.message).toContain("--by bench-verifier");
  });

  it("records nothing and files nothing", () => {
    expect(guard("verifier", PIPELINE).exit).toBe(2);
    expect(
      guard("verifier", `${PNPM} bench:records add-task - --dir bench`).exit,
    ).toBe(2);
  });
});

describe("bench:fix verbs", () => {
  const FIX = "pnpm --filter @powerhousedao/reactor bench:fix";
  const verbs = [
    `${FIX} gate T-007`,
    `${FIX} sites T-007 --context 40`,
    `${FIX} cases bench/results/write-cache.json`,
    `${FIX} criterion --before /tmp/before.json --case "Cold miss rebuild (1000 operations)" --max-ratio 0.65 --fail-ratio 0.9 --control "No-cache baseline: manual rebuild (1000 operations)"`,
    `${FIX} compare --criterion bench/results/criterion.json --after bench/results/write-cache.json`,
    `${FIX} dist-check --marker replayHash --package shared`,
    `${FIX} ci --integration`,
    "cp packages/reactor/bench/results/write-cache.json /tmp/before.json",
  ];

  it("are read-only for every agent role, so none is blocked", () => {
    for (const role of ["fixer", "verifier", "analyst", "runner", "none"]) {
      for (const command of verbs) {
        expect(guard(role, command).exit, `${role}: ${command}`).toBe(0);
      }
    }
  });
});
