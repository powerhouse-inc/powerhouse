export const meta = {
  name: "bench-fix-loop",
  description:
    "Run /bench-fix task by task until no VERIFIED bench finding is left",
  whenToUse:
    "When every remaining bench finding should be fixed in one sitting. Strictly sequential: benchmarks share the machine and the records lock has no retry. Nothing here pushes - the human pushes the accumulated branch and reads CI once at the end.",
  phases: [
    { title: "Gate", detail: "bench:fix gate picks the next VERIFIED task" },
    {
      title: "Fix",
      detail: "bench-fixer applies the remedy and shows the number moved",
    },
    {
      title: "Check",
      detail: "typecheck and the owning packages real test suite",
    },
    {
      title: "Commit",
      detail: "commit the code the fixer touched, records untouched",
    },
    {
      title: "Record",
      detail: "bench-runner measures the fixed state at that sha",
    },
    {
      title: "Mark",
      detail: "set-status FIXED at that sha, then commit both record files",
    },
  ],
};

const GATE = {
  type: "object",
  additionalProperties: false,
  required: ["found", "exitCode"],
  properties: {
    found: { type: "boolean" },
    exitCode: { type: "number" },
    taskId: { type: "string" },
    kind: { type: "string" },
    priority: { type: "number" },
    title: { type: "string" },
    benchmark: {
      type: "string",
      description:
        "auth | events | queue | queue-only | cache | sync, from the cited record command field",
    },
    citedBIds: { type: "array", items: { type: "string" } },
    verifierNote: { type: "string" },
    blocker: {
      type: "string",
      description: "why the loop must stop, when found is false",
    },
  },
};

const FIXER = {
  type: "object",
  additionalProperties: false,
  required: ["criterion", "summary", "filesChanged"],
  properties: {
    criterion: { type: "string", enum: ["met", "partial", "missed"] },
    criterionFile: { type: "string" },
    compareVerdict: { type: "string" },
    summary: { type: "string" },
    filesChanged: { type: "array", items: { type: "string" } },
    packagesTested: { type: "array", items: { type: "string" } },
    fixedNote: {
      type: "string",
      description: "the fixer's 'For the FIXED note' paragraph",
    },
    forTheAnalyst: { type: "string" },
  },
};

const COMMIT = {
  type: "object",
  additionalProperties: false,
  required: ["ok", "sha"],
  properties: {
    ok: { type: "boolean" },
    sha: { type: "string", description: "short=9 sha of the fix commit" },
    typecheck: {
      type: "string",
      description: "the exit code of pnpm tsc --build in each touched package",
    },
    message: { type: "string" },
    detail: { type: "string" },
  },
};

const CHECK = {
  type: "object",
  additionalProperties: false,
  required: ["status", "completed", "detail"],
  properties: {
    status: { type: "string", enum: ["green", "red"] },
    completed: {
      type: "boolean",
      description:
        "true only if every command below ran to completion and you read its exit code",
    },
    typecheck: { type: "string" },
    tests: {
      type: "string",
      description: 'the suite totals, e.g. "198 files / 3177 tests passed"',
    },
    detail: { type: "string" },
  },
};

const RECORD = {
  type: "object",
  additionalProperties: false,
  required: ["ok"],
  properties: {
    ok: { type: "boolean" },
    recordId: { type: "string" },
    conclusions: { type: "string" },
    detail: { type: "string" },
  },
};

const MARK = {
  type: "object",
  additionalProperties: false,
  required: ["ok"],
  properties: {
    ok: { type: "boolean" },
    recordsSha: { type: "string" },
    detail: { type: "string" },
  },
};

const REACTOR = "pnpm --filter @powerhousedao/reactor";
const RECORD_FILES =
  "packages/reactor/bench/BENCHMARKS.jsonl packages/reactor/bench/TASKS.jsonl";

// Nothing in this loop pushes. Agents correctly refuse to treat script text as
// the per-request push permission the human's rules demand, so a push step can
// only ever stall the loop. Verification is therefore local and scoped to fit
// inside one agent turn: `bench:fix ci` rebuilds the whole workspace and
// outlives that turn, which is what kept forcing answers on unfinished runs.
// The human pushes the accumulated branch and reads CI once at the end.

const MAX_TASKS = args && args.maxTasks ? args.maxTasks : 20;
const ONLY = args && args.only ? args.only : null;
// Tasks the gate would keep choosing and keep stalling on - a finding whose
// remedy already landed, say. Skipping is the human's call, not the loop's.
const SKIP = args && args.skip ? args.skip : [];

const done = [];
let stopped = null;

for (let round = 0; round < MAX_TASKS && !stopped; round++) {
  phase("Gate");

  const gateCmd =
    ONLY && round === 0
      ? `${REACTOR} bench:fix gate ${ONLY}`
      : `${REACTOR} bench:fix gate`;

  const skipNote = SKIP.length
    ? `
    These tasks are deliberately excluded and must never be chosen: ${SKIP.join(", ")}. If the bare gate picks one of them, do not report it - instead list the VERIFIED tasks with
    jq -r 'select(.status=="VERIFIED") | [.id, (.priority|tostring)] | @tsv' packages/reactor/bench/TASKS.jsonl
    pick the lowest priority number that is not excluded (ties go to the one appearing first in the file), and run '${REACTOR} bench:fix gate <that id>' instead. Report that task. If every VERIFIED task is excluded, report found:false with exitCode 4 and say so.
`
    : "";

  const gate = await agent(
    `Run this and report what it says. Do not fix anything, do not commit, do not edit any file.

    ${gateCmd}
${skipNote}
    The gate runs bench:records verify, checks the tree is clean, and prints the next VERIFIED task with its sites, repro, ranked fixes and full history including the verifier's note.

    Report:
    - exitCode: the command's exit code.
    - found: true only if the gate printed a "next:" task AND exited 0.
    - taskId, kind (DEFECT/HARNESS/GAP), priority, title for that task.
    - citedBIds: every B-id the task cites as evidence.
    - benchmark: which benchmark name the cited record's "command" field corresponds to - bench:queue:record means queue, bench:cache:record means cache, bench:auth:record means auth, bench:events:record means events, bench:queue-only:record means queue-only, and the two-reactor sync harness means sync.
    - verifierNote: the verifier's note from the history, verbatim.
    - blocker: when found is false, say why - exit 4 with no next task means nothing is VERIFIED and the loop is done; exit 5 means the tree is dirty; exit 2 means a record file does not parse; exit 6 means the task is not VERIFIED.

    Never attempt a repair. Report and stop.`,
    {
      label: `gate:round-${round + 1}`,
      phase: "Gate",
      schema: GATE,
      agentType: "general-purpose",
    },
  );

  if (!gate || !gate.found) {
    const why = gate && gate.blocker ? gate.blocker : "gate returned nothing";
    if (gate && gate.exitCode === 4) {
      log(`Gate found no VERIFIED task left - the queue is empty. ${why}`);
    } else {
      stopped = {
        at: "gate",
        taskId: null,
        reason: why,
        exitCode: gate ? gate.exitCode : null,
      };
      log(`STOP at gate: ${why}`);
    }
    break;
  }

  const t = gate.taskId;
  log(`${t} (${gate.kind}, P${gate.priority}) - ${gate.title}`);

  phase("Fix");
  let fix = await agent(
    `Fix bench task ${t}. This is Step 1 of /bench-fix; read .claude/commands/bench-fix.md if you need the surrounding contract.

    The task is ${gate.kind}, priority ${gate.priority}: ${gate.title}
    It cites: ${(gate.citedBIds || []).join(", ")}

    The verifier's note, which you follow wherever it disagrees with the task's own details:
    ${gate.verifierNote || "(none recorded)"}

    Write the pass/fail criterion with 'bench:fix criterion' BEFORE the after-run, run the task's repro before and after, and quote 'bench:fix compare's verdict line. Run the tests of the packages you touched. Never touch the two record files, never run git.

    Do NOT run 'bench:fix ci' - it rebuilds the whole workspace and burns the machine the benchmark needs. A separate step typechecks and runs the owning package's suite after you report.

    Report criterion as exactly met, partial or missed - the word from compare's verdict. Include the criterion file path, compare's verdict line, the files you changed, the packages you tested, your 'For the FIXED note' paragraph, and a 'For the analyst' section if the fix uncovered something new.`,
    {
      label: `fix:${t}`,
      phase: "Fix",
      schema: FIXER,
      agentType: "bench-fixer",
    },
  );

  if (!fix) {
    stopped = { at: "fix", taskId: t, reason: "the fixer returned nothing" };
    log(`STOP on ${t}: the fixer returned nothing`);
    break;
  }

  // A fix that did not move the number is not FIXED, and a partial one is
  // explicitly the human's call. Both leave the diff in the tree.
  if (fix.criterion !== "met") {
    stopped = {
      at: "fix",
      taskId: t,
      reason: `criterion ${fix.criterion}`,
      detail: fix.summary,
      compareVerdict: fix.compareVerdict,
      forTheAnalyst: fix.forTheAnalyst,
    };
    log(
      `STOP on ${t}: criterion ${fix.criterion} - the diff is left in the tree for you`,
    );
    break;
  }

  phase("Check");
  const check = await agent(
    `Check the uncommitted fix for bench task ${t} before it is committed. Work in the repository root. Read-only: do not edit, fix, commit or push anything.

    The fixer changed:
    ${(fix.filesChanged || []).join("\n    ")}

    1. For each package owning one of those files, run 'pnpm tsc --build' in that package directory and record the exit code.
    2. Run that package's own real test script - for packages/reactor that is 'pnpm test', which takes about six minutes and is the suite CI runs. Run it to completion and read the totals. Do NOT run 'bench:fix ci': it rebuilds the whole workspace, takes longer than you have, and the benchmark needs the machine.
    3. If another package obviously depends on what changed, run its suite too.

    Wait for each command to finish and read its exit code. Report completed:false and status:red if you are forced to answer before they finish - an unfinished check is not a pass, and saying so is always better than guessing.

    Report status green only if every exit code was 0. Quote any failure.`,
    {
      label: `check:${t}`,
      phase: "Check",
      schema: CHECK,
      agentType: "general-purpose",
    },
  );

  if (!check || check.status !== "green" || check.completed === false) {
    stopped = {
      at: "check",
      taskId: t,
      reason: check
        ? `local check ${check.status}: ${check.detail}`
        : "the check step returned nothing",
      detail: check ? check.detail : null,
    };
    log(
      `STOP on ${t}: the local check did not pass - the diff is left in the tree`,
    );
    break;
  }

  phase("Commit");
  const commit = await agent(
    `Commit the fix for bench task ${t}. Work in the repository root. It has already been typechecked and tested: ${check.typecheck || "tsc 0"}, ${check.tests || "suite green"}.

    1. 'git diff --stat' and confirm it matches these files, and 'git diff --quiet -- ${RECORD_FILES}' to confirm the record files are untouched. If either check fails, do not commit - report ok:false and say what differs.
    ${(fix.filesChanged || []).join("\n    ")}
    2. 'git add' exactly those paths and commit. The subject says what the code now does, not which task it closes. Precedent by kind:
       - HARNESS: fix(reactor): the sync bench times writes to convergence and nothing else
       - DEFECT: fix(shared): the write-cache rebuild reuses the stored hash instead of recomputing it
       - GAP: feat(reactor): the sync bench isolates cross-reactor contention
    This task is ${gate.kind}. What it now does: ${fix.summary}

    End the message with:
    Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>

    lint-staged runs oxlint --fix and oxfmt on the staged files; if it rewrites them the commit still lands. Do NOT push here, do NOT create a branch, do NOT amend or rebase.

    Report ok, typecheck, and sha from 'git rev-parse --short=9 HEAD'.`,
    {
      label: `commit:${t}`,
      phase: "Commit",
      schema: COMMIT,
      agentType: "general-purpose",
    },
  );

  if (!commit || !commit.ok || !commit.sha) {
    stopped = {
      at: "commit",
      taskId: t,
      reason:
        commit && commit.detail ? commit.detail : "the commit step failed",
    };
    log(`STOP on ${t}: ${stopped.reason}`);
    break;
  }

  const fixSha = commit.sha;

  phase("Record");
  // A harness fix changes what the numbers mean, so the old entry stops being
  // a comparable baseline and has to say so.
  const supersedes =
    gate.kind === "HARNESS"
      ? (gate.citedBIds || []).map((b) => `--supersedes ${b}`).join(" ")
      : "";

  let rec = await agent(
    `Record the '${gate.benchmark}' benchmark now that the fix for ${t} is committed at ${fixSha}, CI is green, and the tree is clean.

    Pass --task ${t}${supersedes ? " and " + supersedes : ""}.

    This is slow and must run alone - withLock is O_EXCL with no retry, so nothing else may run alongside it. Before starting, check with 'ps aux | grep -i vitest' that no stray bench or test process is competing for the machine; if one is, report it rather than measuring against it. Do not shorten or kill the run itself.

    If it refuses because the tree is dirty, report that rather than passing --allow-dirty.

    Report the new B-nnn and the conclusions you read back with show.`,
    {
      label: `record:${t}`,
      phase: "Record",
      schema: RECORD,
      agentType: "bench-runner",
    },
  );

  // An agent can finish its side effects and still die returning them - a
  // timeout on the way back looks identical to never having run. Read the
  // files before believing nothing happened.
  if (!rec || !rec.ok || !rec.recordId) {
    log(
      `${t}: the runner returned nothing - checking whether the record landed anyway`,
    );
    const found = await agent(
      `Check whether a benchmark record for bench task ${t} was already written, then stop. Read only; record nothing.

      jq -r 'select(.tasks and (.tasks | index("${t}"))) | [.id, .environment.reactorSha] | @tsv' packages/reactor/bench/BENCHMARKS.jsonl

      A record whose reactorSha starts with ${fixSha} is the one this task needs. Also run '${REACTOR} bench:records verify --dir bench' and confirm it passes.

      Report ok true with that recordId if such a record exists, ok false otherwise. Never run the benchmark yourself.`,
      {
        label: `record:${t}:reconcile`,
        phase: "Record",
        schema: RECORD,
        agentType: "general-purpose",
      },
    );
    if (found && found.ok && found.recordId) {
      log(`${t}: ${found.recordId} was already written - continuing`);
      rec = found;
    }
  }

  if (!rec || !rec.ok || !rec.recordId) {
    stopped = {
      at: "record",
      taskId: t,
      reason:
        rec && rec.detail ? rec.detail : "the after-record was not written",
      sha: fixSha,
    };
    log(
      `STOP on ${t}: ${stopped.reason} - the fix is committed at ${fixSha} but unmarked`,
    );
    break;
  }

  phase("Mark");
  const evidence = (gate.citedBIds || [])
    .concat([rec.recordId])
    .map((b) => `--evidence ${b}`)
    .join(" ");
  const ciNote = ` Local check before commit: ${check.typecheck || "tsc 0"}, ${check.tests || "suite green"}.`;

  let mark = await agent(
    `Mark bench task ${t} FIXED at the sha that fixed it, then commit both record files. Work in the repository root.

    Run exactly:
    ${REACTOR} bench:records set-status ${t} FIXED --dir bench --by claude --commit ${fixSha} ${evidence} --note "<the note below>"

    The note, which carries the criterion, the before and after, and the test result so the next reader does not need the transcript:
    ${fix.fixedNote}${ciNote}

    set-status enforces that FIXED has --commit and cites a record whose environment.reactorSha matches it, or it exits 5 and writes nothing. If it exits 5, report ok:false with the output - do not reach for a different sha.

    Then:
    git add ${RECORD_FILES}
    git commit -m "chore(reactor): mark ${t} fixed at ${fixSha}"

    Do NOT push - this commit is records only; the human pushes the branch at the end. Never set COMMITTED; that is for whoever lands the branch.

    Report ok and the records commit sha.`,
    {
      label: `mark:${t}`,
      phase: "Mark",
      schema: MARK,
      agentType: "general-purpose",
    },
  );

  // Same reconciliation as the record step: set-status may well have landed
  // and the commit with it, with only the answer lost on the way back.
  if (!mark || !mark.ok) {
    log(
      `${t}: the mark step returned nothing - checking whether it landed anyway`,
    );
    mark = await agent(
      `Finish marking bench task ${t} FIXED, doing only the parts that are not already done. Work in the repository root.

      1. Read the task's current state:
         jq -r 'select(.id=="${t}") | [.status, ([.history[].status] | join(" then "))] | @tsv' packages/reactor/bench/TASKS.jsonl
      2. If its status is already FIXED, do NOT run set-status again - it is done. Otherwise run set-status with this note:
         ${REACTOR} bench:records set-status ${t} FIXED --dir bench --by claude --commit ${fixSha} ${evidence} --note "<note>"
         where <note> is: ${fix.fixedNote}${ciNote}
      3. 'git status --porcelain'. If either record file is modified, commit them:
         git add ${RECORD_FILES}
         git commit -m "chore(reactor): mark ${t} fixed at ${fixSha}"
      4. '${REACTOR} bench:records verify --dir bench' must pass.

      Do NOT push. Leaving the records commit local is expected; the human pushes at the end.

      Report ok true if ${t} is FIXED, the record files are committed, and verify passes. Report the records commit sha.`,
      {
        label: `mark:${t}:reconcile`,
        phase: "Mark",
        schema: MARK,
        agentType: "general-purpose",
      },
    );
  }

  if (!mark || !mark.ok) {
    stopped = {
      at: "mark",
      taskId: t,
      reason: mark && mark.detail ? mark.detail : "set-status failed",
      sha: fixSha,
      recordId: rec.recordId,
    };
    log(`STOP on ${t}: ${stopped.reason}`);
    break;
  }

  done.push({
    taskId: t,
    kind: gate.kind,
    priority: gate.priority,
    title: gate.title,
    fixSha,
    recordsSha: mark.recordsSha,
    afterRecord: rec.recordId,
    localCheck: check.tests || "green",
    compareVerdict: fix.compareVerdict || null,
    forTheAnalyst: fix.forTheAnalyst || null,
  });

  log(
    `${t} FIXED at ${fixSha}, measured as ${rec.recordId} (${done.length} done, unpushed)`,
  );
}

if (!stopped && done.length >= MAX_TASKS) {
  log(`Hit the ${MAX_TASKS}-task cap - run again to continue.`);
}

return {
  fixed: done,
  stopped,
  hitCap: !stopped && done.length >= MAX_TASKS,
  analystNotes: done
    .filter((d) => d.forTheAnalyst)
    .map((d) => ({ taskId: d.taskId, note: d.forTheAnalyst })),
};
