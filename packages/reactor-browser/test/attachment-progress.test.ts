import type { AttachmentProgress } from "@powerhousedao/reactor-attachments/client";
import { describe, expect, it } from "vitest";
import {
  createProgressGate,
  doneProgress,
  IDLE_PROGRESS,
  INDETERMINATE_COMMIT_MS,
  toProgressState,
} from "../src/hooks/attachment-progress.js";

function progress(overrides: Partial<AttachmentProgress> = {}) {
  return {
    stage: "uploading",
    loaded: 0,
    total: 100,
    indeterminate: false,
    ...overrides,
  } satisfies AttachmentProgress;
}

function clock(start = 0) {
  let t = start;
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

describe("toProgressState", () => {
  it("converts bytes to the house 0-100 unit and keeps the raw counts", () => {
    expect(toProgressState(progress({ loaded: 25 }))).toEqual({
      percent: 25,
      loaded: 25,
      total: 100,
      indeterminate: false,
    });
  });

  it("reports 0 percent while indeterminate, however many bytes are known", () => {
    expect(
      toProgressState(progress({ loaded: 50, indeterminate: true })).percent,
    ).toBe(0);
  });

  it("reports 0 percent when there is no denominator", () => {
    expect(
      toProgressState(progress({ loaded: 50, total: undefined })).percent,
    ).toBe(0);
  });

  it("treats a zero total as complete (the dedup case)", () => {
    expect(
      toProgressState(progress({ stage: "done", loaded: 0, total: 0 })).percent,
    ).toBe(100);
  });

  it("clamps out-of-range byte counts", () => {
    expect(toProgressState(progress({ loaded: 500 })).percent).toBe(100);
  });

  it("keeps fractional percents, so callers choose the rounding", () => {
    expect(
      toProgressState(progress({ loaded: 1, total: 3 })).percent,
    ).toBeCloseTo(33.333, 2);
  });
});

describe("doneProgress", () => {
  it("is a complete terminal frame", () => {
    expect(doneProgress(2048)).toEqual({
      percent: 100,
      loaded: 2048,
      total: 2048,
      indeterminate: false,
    });
  });
});

describe("IDLE_PROGRESS", () => {
  it("is zeroed and determinate", () => {
    expect(IDLE_PROGRESS).toEqual({
      percent: 0,
      loaded: 0,
      total: undefined,
      indeterminate: false,
    });
  });
});

describe("createProgressGate", () => {
  it("commits a determinate tick only when the whole percent changes", () => {
    const gate = createProgressGate({ now: () => 0 });

    expect(gate(progress({ loaded: 0 }))).toBe(true);
    expect(gate(progress({ loaded: 0 }))).toBe(false);
    expect(gate(progress({ loaded: 1 }))).toBe(true);
    // 1.4% floors to the same whole percent as 1%.
    expect(gate(progress({ loaded: 1, total: 71 }))).toBe(false);
    expect(gate(progress({ loaded: 2 }))).toBe(true);
  });

  it("caps commits at about one per percentage point", () => {
    const gate = createProgressGate({ now: () => 0 });
    let commits = 0;
    for (let loaded = 0; loaded <= 10_000; loaded++) {
      if (gate(progress({ loaded, total: 10_000 }))) commits++;
    }

    expect(commits).toBe(101);
  });

  it("always commits a stage change", () => {
    const gate = createProgressGate({ now: () => 0 });

    expect(gate(progress({ stage: "hashing", loaded: 0 }))).toBe(true);
    expect(gate(progress({ stage: "reserving", loaded: 0 }))).toBe(true);
    expect(gate(progress({ stage: "uploading", loaded: 0 }))).toBe(true);
  });

  it("falls back to a time budget for indeterminate ticks", () => {
    const time = clock();
    const gate = createProgressGate({
      now: time.now,
      indeterminateCommitMs: 100,
    });
    const tick = progress({ stage: "hashing", indeterminate: true, loaded: 1 });

    expect(gate(tick)).toBe(true); // stage change
    expect(gate(tick)).toBe(false);
    time.advance(99);
    expect(gate(tick)).toBe(false);
    time.advance(1);
    expect(gate(tick)).toBe(true);
  });

  it("defaults the indeterminate budget", () => {
    const time = clock();
    const gate = createProgressGate({ now: time.now });
    const tick = progress({ stage: "hashing", indeterminate: true });

    expect(gate(tick)).toBe(true);
    time.advance(INDETERMINATE_COMMIT_MS - 1);
    expect(gate(tick)).toBe(false);
    time.advance(1);
    expect(gate(tick)).toBe(true);
  });

  // Stage entry is indeterminate at 0%, so a percent-only rule latches on 0 and
  // swallows the very event that clears the spinner.
  it("commits the first byte event of a stage even below one percent", () => {
    const gate = createProgressGate({ now: () => 0 });

    expect(
      gate(progress({ stage: "uploading", indeterminate: true, loaded: 0 })),
    ).toBe(true);
    // 64 KB of a 50 MB upload: still 0%, but the bar now has a position and
    // the spinner has to come down.
    expect(
      gate(progress({ stage: "uploading", loaded: 64_000, total: 50_000_000 })),
    ).toBe(true);
  });

  it("commits when a determinate stage turns indeterminate again", () => {
    const gate = createProgressGate({ now: () => 0 });

    expect(gate(progress({ loaded: 30 }))).toBe(true);
    expect(gate(progress({ loaded: 30, indeterminate: true }))).toBe(true);
  });

  it("commits when a stage loses its denominator", () => {
    const gate = createProgressGate({ now: () => 0 });

    expect(gate(progress({ loaded: 30 }))).toBe(true);
    expect(gate(progress({ loaded: 31, total: undefined }))).toBe(true);
  });

  // Without a denominator there is no percent to change, so the percent rule
  // would suppress every tick of the stage for its whole duration.
  it("falls back to the time budget when bytes arrive with no denominator", () => {
    const time = clock();
    const gate = createProgressGate({
      now: time.now,
      indeterminateCommitMs: 100,
    });
    const tick = (loaded: number) =>
      progress({ stage: "downloading", loaded, total: undefined });

    expect(gate(tick(1))).toBe(true); // stage change
    expect(gate(tick(2))).toBe(false);
    time.advance(99);
    expect(gate(tick(3))).toBe(false);
    time.advance(1);
    expect(gate(tick(4))).toBe(true);
  });

  it("does not let an indeterminate stage go dark while bytes are moving", () => {
    const time = clock();
    const gate = createProgressGate({
      now: time.now,
      indeterminateCommitMs: 10,
    });
    let commits = 0;
    for (let i = 0; i < 5; i++) {
      time.advance(10);
      if (gate(progress({ stage: "hashing", indeterminate: true, loaded: i })))
        commits++;
    }

    expect(commits).toBe(5);
  });
});
