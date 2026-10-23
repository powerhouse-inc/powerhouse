import { afterEach, describe, expect, it, vi } from "vitest";
import {
  progressRows,
  renderBars,
  renderLine,
  startProgressDisplay,
  type ProgressRow,
  type ProgressStream,
} from "../src/services/run/catch-up-progress.js";

function stream(isTTY: boolean): ProgressStream & { out: string[] } {
  const out: string[] = [];
  return {
    out,
    isTTY,
    columns: 60,
    write: ((chunk: string | Uint8Array) => {
      out.push(
        typeof chunk === "string" ? chunk : Buffer.from(chunk).toString(),
      );
      return true;
    }) as ProgressStream["write"],
  };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

const catchingUp: ProgressRow[] = [
  { label: "sektar", fraction: 0.62, state: "catching-up" },
  { label: "document-view", fraction: 1, state: "done" },
];

describe("renderBars", () => {
  it("fits every line to the terminal width and states the progress", () => {
    const lines = renderBars(catchingUp, 60);

    expect(lines).toHaveLength(2);
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(60);
    expect(lines[0]).toMatch(/^sektar\s+█+░+\s+62%$/);
    expect(lines[1]).toMatch(/^document-view\s+█+\s+done$/);
  });

  it("keeps the end of a long label, where processor factories differ", () => {
    const [line] = renderBars(
      [
        {
          label: "D:\\projects\\ph-win\\workspace\\sektar",
          fraction: 0,
          state: "errored",
        },
      ],
      80,
    );

    expect(line).toMatch(/^….*workspace\\sektar /);
    expect(line).toMatch(/errored$/);
  });
});

describe("progressRows", () => {
  it("names a project factory by its folder, with its drives, and maps phases", () => {
    const rows = progressRows({
      head: 100,
      headKnown: true,
      factories: [
        {
          factoryId: "D:\\projects\\ph-win\\workspace\\sektar",
          label: "sektar",
          driveCount: 8,
          phase: "catching-up",
          done: 31,
          total: 50,
          fraction: 0.62,
          processorsDone: 0,
          processors: [],
        },
        {
          factoryId: "@powerhousedao/vetra",
          label: "vetra",
          driveCount: 1,
          phase: "live",
          done: 0,
          total: 0,
          fraction: 1,
          processorsDone: 0,
          processors: [],
        },
        {
          factoryId: "broken",
          label: "broken",
          driveCount: 2,
          phase: "errored",
          done: 0,
          total: 10,
          fraction: 0,
          processorsDone: 0,
          processors: [],
        },
      ],
      readModels: [
        {
          consumerId: "document-view",
          thread: "host",
          appliedThrough: 100,
          head: 100,
          fraction: 1,
          complete: true,
          blocked: false,
        },
        {
          consumerId: "document-indexer",
          thread: "host",
          appliedThrough: 40,
          head: 100,
          fraction: 0.4,
          complete: false,
          blocked: true,
        },
      ],
    });

    expect(rows).toEqual([
      { label: "sektar (8 drives)", fraction: 0.62, state: "catching-up" },
      { label: "vetra (1 drive)", fraction: 1, state: "done" },
      { label: "broken (2 drives)", fraction: 0, state: "errored" },
      { label: "document-view", fraction: 1, state: "done" },
      { label: "document-indexer", fraction: 0.4, state: "errored" },
    ]);
  });
});

describe("renderLine", () => {
  it("lists only what is still catching up", () => {
    expect(renderLine(catchingUp)).toBe("catch-up: sektar 62%");
  });
});

describe("startProgressDisplay", () => {
  afterEach(() => vi.useRealTimers());

  it("draws the bars in a terminal and prints other output above them", async () => {
    const stdout = stream(true);
    const stderr = stream(true);
    const display = startProgressDisplay(() => Promise.resolve(catchingUp), {
      stdout,
      stderr,
      pollMs: 60_000,
    });
    await settle();
    expect(stdout.out.join("")).toContain("62%");

    stdout.out.length = 0;
    stdout.write("a log line\n");

    const written = stdout.out.join("");
    expect(written.indexOf("\x1b[2A")).toBeLessThan(
      written.indexOf("a log line"),
    );
    expect(written.indexOf("a log line")).toBeLessThan(
      written.lastIndexOf("62%"),
    );
    display.stop();
  });

  it("does not redraw in the middle of a line another write left open", async () => {
    const stdout = stream(true);
    const display = startProgressDisplay(() => Promise.resolve(catchingUp), {
      stdout,
      stderr: stream(true),
      pollMs: 60_000,
    });
    await settle();
    stdout.out.length = 0;

    stdout.write("partial ");
    expect(stdout.out.join("")).not.toContain("62%");
    stdout.write("line\n");
    expect(stdout.out.join("")).toContain("62%");
    display.stop();
  });

  it("removes the bars once everything is done, and restores the streams on stop", async () => {
    const stdout = stream(true);
    const stderr = stream(true);
    const original = stdout.write;
    let rows: ProgressRow[] = catchingUp;
    vi.useFakeTimers();
    const display = startProgressDisplay(() => Promise.resolve(rows), {
      stdout,
      stderr,
      pollMs: 1_000,
    });
    await vi.advanceTimersByTimeAsync(0);
    rows = catchingUp.map((row) => ({ ...row, fraction: 1, state: "done" }));
    stdout.out.length = 0;
    await vi.advanceTimersByTimeAsync(1_000);

    expect(stdout.out.join("")).toContain("\x1b[0J");
    expect(stdout.out.join("")).not.toContain("█");

    display.stop();
    expect(stdout.write).toBe(original);
  });

  it("prints a progress line on a timer without a terminal, and leaves writes alone", async () => {
    const stdout = stream(false);
    const original = stdout.write;
    vi.useFakeTimers();
    const display = startProgressDisplay(() => Promise.resolve(catchingUp), {
      stdout,
      stderr: stream(false),
      pollMs: 1_000,
      lineMs: 5_000,
    });
    await vi.advanceTimersByTimeAsync(4_000);

    expect(stdout.write).toBe(original);
    expect(
      stdout.out.filter((line) => line.startsWith("catch-up:")),
    ).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(
      stdout.out.filter((line) => line.startsWith("catch-up:")),
    ).toHaveLength(2);
    display.stop();
  });

  it("keeps the last rows when the reactor does not answer", async () => {
    const stdout = stream(false);
    let fail = false;
    vi.useFakeTimers();
    const display = startProgressDisplay(
      () =>
        fail ? Promise.reject(new Error("busy")) : Promise.resolve(catchingUp),
      { stdout, stderr: stream(false), pollMs: 1_000, lineMs: 1_000 },
    );
    await vi.advanceTimersByTimeAsync(0);
    fail = true;
    await vi.advanceTimersByTimeAsync(1_000);

    expect(stdout.out.at(-1)).toBe("catch-up: sektar 62%\n");
    display.stop();
  });
});
