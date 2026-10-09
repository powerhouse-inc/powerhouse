import { describe, expect, it } from "vitest";
import {
  documentToAsk,
  MAX_TIMER_DELAY_MS,
  newRetryEntry,
  nextAfter,
  resetRetry,
  withDocument,
  type FetchOutcome,
  type RetryEntry,
  type RetryState,
} from "../../src/replication/retry-state.js";
import type { AttachmentRetryPolicy } from "../../src/replication/types.js";

const NOW = 1_000_000;
const LIVE = new Date(NOW + 60_000).toISOString();
const EXPIRED = new Date(NOW).toISOString();

const POLICY: AttachmentRetryPolicy = {
  pendingRetryMs: 1_000,
  minPendingRetryMs: 250,
  maxPendingRetryMs: 8_000,
  notFoundAttempts: 3,
  notFoundRetryMs: 500,
  errorAttempts: 3,
  errorRetryMs: 100,
};

function entry(overrides: Partial<RetryEntry> = {}): RetryEntry {
  return { ...newRetryEntry("D1"), ...overrides };
}

function pending(
  documentId: string,
  retryAfterMs = 2_000,
  expiresAtUtc = LIVE,
): FetchOutcome {
  return { kind: "pending", documentId, expiresAtUtc, retryAfterMs };
}

const notFound = (documentId: string): FetchOutcome => ({
  kind: "not-found",
  documentId,
});
const error = (documentId: string): FetchOutcome => ({
  kind: "error",
  documentId,
});
const busy = (documentId: string, retryAfterMs = 1_000): FetchOutcome => ({
  kind: "busy",
  documentId,
  retryAfterMs,
});

type Row = {
  name: string;
  from: RetryEntry;
  outcome: FetchOutcome;
  state: RetryState;
  delayMs: number | undefined;
  expect?: Partial<RetryEntry>;
  next?: string;
  policy?: Partial<AttachmentRetryPolicy>;
};

const ROWS: Row[] = [
  {
    name: "data is held",
    from: entry({ errorRun: 2, pendingRun: 2 }),
    outcome: { kind: "data" },
    state: "held",
    delayMs: undefined,
    expect: { errorRun: 0, pendingRun: 0 },
  },
  {
    name: "an abort re-queues and counts nothing",
    from: entry({ notFoundAnswers: 1, errorRun: 2, pendingRun: 4 }),
    outcome: { kind: "aborted" },
    state: "queued",
    delayMs: undefined,
    expect: {
      notFoundAnswers: 1,
      errorRun: 2,
      pendingRun: 4,
      unasked: ["D1"],
    },
  },
  {
    name: "a live pending waits its retryAfterMs and moves its document to the front",
    from: entry({ unasked: ["D1"], asked: ["D2"] }),
    outcome: pending("D1"),
    state: "waiting",
    delayMs: 2_000,
    expect: {
      pendingRun: 1,
      unasked: [],
      asked: ["D1", "D2"],
      livePending: { documentId: "D1", untilMs: NOW + 60_000 },
    },
    next: "D1",
  },
  {
    name: "a pending delay below the floor is raised to it",
    from: entry(),
    outcome: pending("D1", 0),
    state: "waiting",
    delayMs: 250,
  },
  {
    name: "a pending delay that is not a number falls back",
    from: entry(),
    outcome: pending("D1", Number.NaN),
    state: "waiting",
    delayMs: 1_000,
  },
  {
    name: "a pending delay doubles per pending in the run",
    from: entry({ pendingRun: 2 }),
    outcome: pending("D1", 1_000),
    state: "waiting",
    delayMs: 4_000,
    expect: { pendingRun: 3 },
  },
  {
    name: "a long pending run stops growing at the cap",
    from: entry({ pendingRun: 40 }),
    outcome: pending("D1", 1_000),
    state: "waiting",
    delayMs: 8_000,
  },
  {
    name: "a pending that asks for more than the cap gets the cap",
    from: entry(),
    outcome: pending("D1", 1e12),
    state: "waiting",
    delayMs: 8_000,
  },
  {
    name: "a pending delay is clamped to the timer range",
    from: entry(),
    outcome: pending("D1", 1e12),
    state: "waiting",
    delayMs: MAX_TIMER_DELAY_MS,
    policy: { maxPendingRetryMs: 1e13 },
  },
  {
    name: "a pending spends no budget and ends the error run",
    from: entry({ notFoundAnswers: 2, errorRun: 2 }),
    outcome: pending("D1"),
    state: "waiting",
    delayMs: 2_000,
    expect: { notFoundAnswers: 2, errorRun: 0 },
  },
  {
    name: "a busy answer waits without touching the reservation, the runs or the documents",
    from: entry({
      notFoundAnswers: 1,
      errorRun: 2,
      pendingRun: 2,
      livePending: { documentId: "D2", untilMs: NOW + 60_000 },
      unasked: [],
      asked: ["D1", "D2"],
    }),
    outcome: busy("D1"),
    state: "waiting",
    delayMs: 1_000,
    expect: {
      busyRun: 1,
      notFoundAnswers: 1,
      errorRun: 2,
      pendingRun: 2,
      livePending: { documentId: "D2", untilMs: NOW + 60_000 },
      asked: ["D1", "D2"],
    },
    next: "D1",
  },
  {
    name: "a busy delay doubles per busy answer in the run",
    from: entry({ busyRun: 2 }),
    outcome: busy("D1"),
    state: "waiting",
    delayMs: 4_000,
    expect: { busyRun: 3 },
  },
  {
    name: "a busy run that reaches the pending cap counts as one error",
    from: entry({ busyRun: 3, errorRun: 1 }),
    outcome: busy("D1"),
    state: "waiting",
    delayMs: 200,
    expect: { busyRun: 0, errorRun: 2 },
  },
  {
    name: "a busy run that reaches the cap at the error budget fails",
    from: entry({ busyRun: 3, errorRun: 2 }),
    outcome: busy("D1"),
    state: "failed",
    delayMs: undefined,
  },
  {
    name: "an expired pending is a not-found",
    from: entry({ pendingRun: 3 }),
    outcome: pending("D1", 2_000, EXPIRED),
    state: "waiting",
    delayMs: 500,
    expect: { notFoundAnswers: 1, pendingRun: 0, unasked: [], asked: ["D1"] },
  },
  {
    name: "an unparseable pending expiry is a not-found",
    from: entry(),
    outcome: pending("D1", 2_000, "not a date"),
    state: "waiting",
    delayMs: 500,
    expect: { notFoundAnswers: 1 },
  },
  {
    name: "an expired pending at the not-found budget ends not-found, not failed",
    from: entry({ notFoundAnswers: 2, unasked: [], asked: ["D1"] }),
    outcome: pending("D1", 2_000, EXPIRED),
    state: "not-found",
    delayMs: undefined,
  },
  {
    name: "a not-found waits, ends both runs and moves its document to the back",
    from: entry({
      errorRun: 2,
      pendingRun: 5,
      unasked: [],
      asked: ["D1", "D2"],
    }),
    outcome: notFound("D1"),
    state: "waiting",
    delayMs: 500,
    expect: {
      notFoundAnswers: 1,
      errorRun: 0,
      pendingRun: 0,
      asked: ["D2", "D1"],
    },
    next: "D2",
  },
  {
    name: "a second not-found doubles the wait",
    from: entry({ notFoundAnswers: 1 }),
    outcome: notFound("D1"),
    state: "waiting",
    delayMs: 1_000,
  },
  {
    name: "a not-found at the budget is terminal",
    from: entry({ notFoundAnswers: 2 }),
    outcome: notFound("D1"),
    state: "not-found",
    delayMs: undefined,
    expect: { notFoundAnswers: 3, unasked: [], asked: ["D1"] },
  },
  {
    name: "a not-found at the budget waits while a document is unasked",
    from: entry({ notFoundAnswers: 2, unasked: ["D1", "D2"] }),
    outcome: notFound("D1"),
    state: "waiting",
    delayMs: 2_000,
    next: "D2",
  },
  {
    name: "a not-found at the budget waits while another document's pending is live",
    from: entry({
      notFoundAnswers: 2,
      unasked: [],
      asked: ["D1", "D2"],
      livePending: { documentId: "D1", untilMs: NOW + 60_000 },
    }),
    outcome: notFound("D2"),
    state: "waiting",
    delayMs: 2_000,
    expect: { livePending: { documentId: "D1", untilMs: NOW + 60_000 } },
    next: "D1",
  },
  {
    name: "a not-found from the pending document itself ends the reservation",
    from: entry({
      notFoundAnswers: 2,
      unasked: [],
      asked: ["D1", "D2"],
      livePending: { documentId: "D1", untilMs: NOW + 60_000 },
    }),
    outcome: notFound("D1"),
    state: "not-found",
    delayMs: undefined,
    expect: { livePending: undefined },
  },
  {
    name: "a not-found at the budget after another document's pending expired is terminal",
    from: entry({
      notFoundAnswers: 2,
      unasked: [],
      asked: ["D1", "D2"],
      livePending: { documentId: "D1", untilMs: NOW },
    }),
    outcome: notFound("D2"),
    state: "not-found",
    delayMs: undefined,
  },
  {
    name: "an error waits, keeps its document unasked and leaves not-found alone",
    from: entry({ notFoundAnswers: 2, pendingRun: 3, unasked: ["D1", "D2"] }),
    outcome: error("D1"),
    state: "waiting",
    delayMs: 100,
    expect: {
      notFoundAnswers: 2,
      errorRun: 1,
      pendingRun: 0,
      unasked: ["D1", "D2"],
    },
    next: "D1",
  },
  {
    name: "a second error in a run doubles the wait",
    from: entry({ errorRun: 1 }),
    outcome: error("D1"),
    state: "waiting",
    delayMs: 200,
  },
  {
    name: "an error at the budget fails and counts its document as asked",
    from: entry({ errorRun: 2 }),
    outcome: error("D1"),
    state: "failed",
    delayMs: undefined,
    expect: { errorRun: 3, unasked: [], asked: ["D1"] },
  },
  {
    name: "an error at the budget waits while another document is unasked",
    from: entry({ errorRun: 2, unasked: ["D1", "D2"] }),
    outcome: error("D1"),
    state: "waiting",
    delayMs: 400,
    expect: { unasked: ["D2"], asked: ["D1"] },
    next: "D2",
  },
  {
    name: "an error past the budget from the last unasked document fails",
    from: entry({ errorRun: 3, unasked: ["D2"], asked: ["D1"] }),
    outcome: error("D2"),
    state: "failed",
    delayMs: undefined,
    expect: { unasked: [], asked: ["D1", "D2"] },
  },
];

describe("nextAfter", () => {
  it.each(ROWS.map((row) => [row.name, row] as const))("%s", (_name, row) => {
    const transition = nextAfter(row.from, row.outcome, NOW, {
      ...POLICY,
      ...row.policy,
    });
    expect(transition.state).toBe(row.state);
    expect(transition.delayMs).toBe(row.delayMs);
    expect(transition.entry).toMatchObject(row.expect ?? {});
    if (row.next !== undefined) {
      expect(documentToAsk(transition.entry)).toBe(row.next);
    }
  });

  function run(
    start: RetryEntry,
    outcomes: FetchOutcome[],
  ): Array<{ state: RetryState; delayMs: number | undefined }> {
    let current = start;
    return outcomes.map((outcome) => {
      const transition = nextAfter(current, outcome, NOW, POLICY);
      current = transition.entry;
      return { state: transition.state, delayMs: transition.delayMs };
    });
  }

  it("keeps the pending run per run: a not-found restarts the backoff", () => {
    const steps = run(entry(), [
      pending("D1", 1_000),
      pending("D1", 1_000),
      pending("D1", 1_000),
      notFound("D1"),
      pending("D1", 1_000),
    ]);
    expect(steps.map((step) => step.delayMs)).toEqual([
      1_000, 2_000, 4_000, 500, 1_000,
    ]);
  });

  it("keeps the error run per run: any answer ends it", () => {
    const steps = run(entry(), [
      error("D1"),
      error("D1"),
      pending("D1"),
      error("D1"),
      error("D1"),
      notFound("D1"),
      error("D1"),
      error("D1"),
    ]);
    expect(steps.every((step) => step.state === "waiting")).toBe(true);
  });

  it("keeps not-found cumulative across errors and pendings", () => {
    const steps = run(entry(), [
      notFound("D1"),
      error("D1"),
      pending("D1"),
      notFound("D1"),
      error("D1"),
      notFound("D1"),
    ]);
    expect(steps.map((step) => step.state)).toEqual([
      "waiting",
      "waiting",
      "waiting",
      "waiting",
      "waiting",
      "not-found",
    ]);
  });

  it("ends any other outcome's busy run", () => {
    for (const outcome of [
      pending("D1"),
      notFound("D1"),
      error("D1"),
      { kind: "data" } as const,
    ]) {
      expect(
        nextAfter(entry({ busyRun: 3 }), outcome, NOW, POLICY).entry,
      ).toMatchObject({ busyRun: 0 });
    }
  });

  it("ends a source that only ever answers busy in failed", () => {
    let current = entry();
    let now = NOW;
    let answers = 0;
    let state: RetryState = "waiting";
    while (state === "waiting" && answers < 1_000) {
      const transition = nextAfter(current, busy("D1"), now, POLICY);
      current = transition.entry;
      state = transition.state;
      now += transition.delayMs ?? 0;
      answers += 1;
    }
    expect(state).toBe("failed");
    expect(now - NOW).toBeLessThan(60_000);
  });

  it("never ends on pending alone", () => {
    let current = entry();
    for (let i = 0; i < 1_000; i += 1) {
      const transition = nextAfter(current, pending("D1", 0), NOW, POLICY);
      expect(transition.state).toBe("waiting");
      current = transition.entry;
    }
    expect(current).toMatchObject({ notFoundAnswers: 0, errorRun: 0 });
  });
});

describe("document selection", () => {
  it("asks unasked documents first, oldest first, then the asked order", () => {
    expect(documentToAsk(entry({ unasked: ["D2", "D3"], asked: ["D1"] }))).toBe(
      "D2",
    );
    expect(documentToAsk(entry({ unasked: [], asked: ["D1", "D2"] }))).toBe(
      "D1",
    );
  });

  it.each([
    ["queued", false],
    ["fetching", false],
    ["waiting", false],
    ["held", false],
    ["not-found", true],
    ["failed", true],
  ] as const)(
    "appends a new document to the FIFO in state %s (revive: %s)",
    (state, revive) => {
      const result = withDocument(
        entry({ unasked: ["D2"], asked: ["D1"] }),
        "D3",
        state,
      );
      expect(result.revive).toBe(revive);
      expect(result.entry.unasked).toEqual(["D2", "D3"]);
      expect(result.entry.asked).toEqual(["D1"]);
    },
  );

  it("resetRetry zeroes every counter and makes every document unasked", () => {
    expect(resetRetry(["D1", "D2"])).toEqual({
      notFoundAnswers: 0,
      errorRun: 0,
      pendingRun: 0,
      busyRun: 0,
      livePending: undefined,
      unasked: ["D1", "D2"],
      asked: [],
    });
  });
});
