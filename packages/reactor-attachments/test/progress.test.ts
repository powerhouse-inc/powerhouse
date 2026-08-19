import { describe, expect, it } from "vitest";
import {
  DEFAULT_PROGRESS_THROTTLE_MS,
  ProgressEmitter,
  progressFraction,
  withByteProgress,
  type AttachmentProgress,
} from "../src/progress.js";

function collector() {
  const events: AttachmentProgress[] = [];
  return { events, onProgress: (p: AttachmentProgress) => events.push(p) };
}

/** Manual clock so throttle assertions never depend on wall time. */
function clock(start = 0) {
  let t = start;
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

function streamOf(...chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
}

async function drain(stream: ReadableStream<Uint8Array>): Promise<number> {
  const reader = stream.getReader();
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return total;
    total += value.byteLength;
  }
}

describe("progressFraction", () => {
  it("reads indeterminate and unknown-total events as 0", () => {
    expect(
      progressFraction({
        stage: "hashing",
        loaded: 50,
        total: 100,
        indeterminate: true,
      }),
    ).toBe(0);
    expect(
      progressFraction({
        stage: "uploading",
        loaded: 50,
        total: undefined,
        indeterminate: false,
      }),
    ).toBe(0);
  });

  it("treats a zero total as complete", () => {
    expect(
      progressFraction({
        stage: "done",
        loaded: 0,
        total: 0,
        indeterminate: false,
      }),
    ).toBe(1);
  });

  it("clamps to 0..1", () => {
    expect(
      progressFraction({
        stage: "uploading",
        loaded: 25,
        total: 100,
        indeterminate: false,
      }),
    ).toBe(0.25);
    expect(
      progressFraction({
        stage: "uploading",
        loaded: 300,
        total: 100,
        indeterminate: false,
      }),
    ).toBe(1);
  });
});

describe("ProgressEmitter", () => {
  it("reports inactive with no listener and emits nothing", () => {
    const emitter = new ProgressEmitter();
    expect(emitter.active).toBe(false);
    emitter.stage("uploading", { total: 10 });
    emitter.bytes(5);
    emitter.finish();
  });

  it("emits an indeterminate event on stage entry (I3 reset)", () => {
    const { events, onProgress } = collector();
    const emitter = new ProgressEmitter({ onProgress, throttleMs: 0 });

    emitter.stage("hashing", { total: 100 });
    emitter.bytes(40);
    emitter.stage("uploading", { total: 100 });

    expect(events[0]).toEqual({
      stage: "hashing",
      loaded: 0,
      total: 100,
      indeterminate: true,
    });
    expect(events[2]).toEqual({
      stage: "uploading",
      loaded: 0,
      total: 100,
      indeterminate: true,
    });
  });

  it("flips to determinate as soon as a transport counts bytes", () => {
    const { events, onProgress } = collector();
    const emitter = new ProgressEmitter({ onProgress, throttleMs: 0 });

    emitter.stage("uploading", { total: 100 });
    emitter.bytes(30);

    expect(events[1]).toEqual({
      stage: "uploading",
      loaded: 30,
      total: 100,
      indeterminate: false,
    });
  });

  it("stays silent for a stage no transport ever counts (fetch fallback)", () => {
    const { events, onProgress } = collector();
    const emitter = new ProgressEmitter({ onProgress, throttleMs: 0 });

    emitter.stage("uploading", { total: 100 });
    emitter.finish();

    expect(events.map((e) => [e.stage, e.indeterminate])).toEqual([
      ["uploading", true],
      ["done", false],
    ]);
  });

  it("keeps loaded non-decreasing within a stage (I3)", () => {
    const { events, onProgress } = collector();
    const emitter = new ProgressEmitter({ onProgress, throttleMs: 0 });

    emitter.stage("downloading", { total: 100 });
    emitter.bytes(60);
    emitter.bytes(20);

    expect(events.at(-1)?.loaded).toBe(60);
  });

  it("emits the leading edge immediately, then throttles by time", () => {
    const { events, onProgress } = collector();
    const time = clock();
    const emitter = new ProgressEmitter({
      onProgress,
      throttleMs: 100,
      now: time.now,
    });

    emitter.stage("uploading", { total: 1000 });
    emitter.bytes(10); // leading edge: always emits
    emitter.bytes(20); // same instant: throttled away
    time.advance(99);
    emitter.bytes(30); // still inside the window
    time.advance(1);
    emitter.bytes(40); // window elapsed

    expect(events.map((e) => e.loaded)).toEqual([0, 10, 40]);
  });

  it("defaults the throttle to 100ms", () => {
    const { events, onProgress } = collector();
    const time = clock();
    const emitter = new ProgressEmitter({ onProgress, now: time.now });

    emitter.stage("uploading", { total: 1000 });
    emitter.bytes(1);
    time.advance(DEFAULT_PROGRESS_THROTTLE_MS - 1);
    emitter.bytes(2);
    time.advance(1);
    emitter.bytes(3);

    expect(events.map((e) => e.loaded)).toEqual([0, 1, 3]);
  });

  it("gives every stage its own leading edge", () => {
    const { events, onProgress } = collector();
    const time = clock();
    const emitter = new ProgressEmitter({
      onProgress,
      throttleMs: 1_000,
      now: time.now,
    });

    emitter.stage("uploading", { total: 100 });
    emitter.bytes(10);
    emitter.stage("downloading", { total: 100 });
    emitter.bytes(10);

    expect(events).toHaveLength(4);
  });

  it("bypasses the throttle for the terminal event (I4)", () => {
    const { events, onProgress } = collector();
    const time = clock();
    const emitter = new ProgressEmitter({
      onProgress,
      throttleMs: 10_000,
      now: time.now,
    });

    emitter.stage("uploading", { total: 100 });
    emitter.bytes(10);
    emitter.finish();

    expect(events.at(-1)).toEqual({
      stage: "done",
      loaded: 100,
      total: 100,
      indeterminate: false,
    });
  });

  it("finishes at loaded === total with a real denominator (I2)", () => {
    const { events, onProgress } = collector();
    const emitter = new ProgressEmitter({ onProgress, throttleMs: 0 });

    emitter.stage("reserving");
    emitter.finish();

    const terminal = events.at(-1);
    expect(terminal?.indeterminate).toBe(false);
    expect(typeof terminal?.total).toBe("number");
    expect(terminal?.loaded).toBe(terminal?.total);
  });

  it("falls back to observed bytes when the stage had no denominator", () => {
    const { events, onProgress } = collector();
    const emitter = new ProgressEmitter({ onProgress, throttleMs: 0 });

    emitter.stage("downloading");
    emitter.bytes(77);
    emitter.finish();

    expect(events.at(-1)).toEqual({
      stage: "done",
      loaded: 77,
      total: 77,
      indeterminate: false,
    });
  });

  it("reports a confirmed dedup as zero bytes of zero", () => {
    const { events, onProgress } = collector();
    const emitter = new ProgressEmitter({ onProgress, throttleMs: 0 });

    emitter.stage("hashing", { total: 4096 });
    emitter.stage("reserving");
    emitter.finishDeduped();

    expect(events.at(-1)).toEqual({
      stage: "done",
      loaded: 0,
      total: 0,
      indeterminate: false,
      deduped: true,
    });
    expect(events.filter((e) => e.stage === "uploading")).toEqual([]);
  });

  it("omits deduped on an ordinary finish", () => {
    const { events, onProgress } = collector();
    const emitter = new ProgressEmitter({ onProgress, throttleMs: 0 });

    emitter.stage("uploading", { total: 10 });
    emitter.finish();

    expect("deduped" in (events.at(-1) as object)).toBe(false);
  });

  it("carries the last known byte counts into error (I5)", () => {
    const { events, onProgress } = collector();
    const emitter = new ProgressEmitter({ onProgress, throttleMs: 0 });

    emitter.stage("uploading", { total: 10_000 });
    emitter.bytes(3_200);
    emitter.fail();

    expect(events.at(-1)).toEqual({
      stage: "error",
      loaded: 3_200,
      total: 10_000,
      indeterminate: false,
    });
  });

  it("emits exactly one terminal event and latches (I1)", () => {
    const { events, onProgress } = collector();
    const emitter = new ProgressEmitter({ onProgress, throttleMs: 0 });

    emitter.stage("uploading", { total: 10 });
    emitter.finish();
    emitter.fail();
    emitter.finish();
    emitter.stage("downloading", { total: 5 });
    emitter.bytes(5);

    expect(
      events.filter((e) => e.stage === "done" || e.stage === "error"),
    ).toHaveLength(1);
    expect(events.at(-1)?.stage).toBe("done");
  });

  it("ignores bytes reported before any stage", () => {
    const { events, onProgress } = collector();
    const emitter = new ProgressEmitter({ onProgress, throttleMs: 0 });

    emitter.bytes(100);

    expect(events).toEqual([]);
  });
});

describe("withByteProgress", () => {
  it("returns the source untouched when no hook is supplied", () => {
    const source = streamOf(new Uint8Array([1]));
    expect(withByteProgress(source, {})).toBe(source);
  });

  it("counts cumulative bytes as the consumer reads", async () => {
    const seen: number[] = [];
    const wrapped = withByteProgress(
      streamOf(new Uint8Array(3), new Uint8Array(5), new Uint8Array(2)),
      { onBytes: (loaded) => seen.push(loaded) },
    );

    expect(await drain(wrapped)).toBe(10);
    expect(seen).toEqual([3, 8, 10]);
  });

  it("counts nothing until the consumer actually reads", async () => {
    const seen: number[] = [];
    withByteProgress(streamOf(new Uint8Array(4), new Uint8Array(4)), {
      onBytes: (loaded) => seen.push(loaded),
    });

    // A default queuing strategy would have pulled one chunk on construction.
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(seen).toEqual([]);
  });

  it("does not count ahead of the consumer", async () => {
    const seen: number[] = [];
    const wrapped = withByteProgress(
      streamOf(new Uint8Array(4), new Uint8Array(4)),
      { onBytes: (loaded) => seen.push(loaded) },
    );

    const reader = wrapped.getReader();
    await reader.read();
    expect(seen).toEqual([4]);
    await reader.read();
    expect(seen).toEqual([4, 8]);
    await reader.cancel();
  });

  it("fires onDone only after the last byte reaches the consumer", async () => {
    const order: string[] = [];
    const wrapped = withByteProgress(streamOf(new Uint8Array(2)), {
      onBytes: () => order.push("bytes"),
      onDone: () => order.push("done"),
    });

    const reader = wrapped.getReader();
    await reader.read();
    expect(order).toEqual(["bytes"]);
    await reader.read();
    expect(order).toEqual(["bytes", "done"]);
  });

  it("reports and propagates a source error", async () => {
    const failure = new Error("network died");
    const source = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.error(failure);
      },
    });
    let captured: unknown;
    const wrapped = withByteProgress(source, {
      onError: (err) => {
        captured = err;
      },
    });

    await expect(drain(wrapped)).rejects.toThrow("network died");
    expect(captured).toBe(failure);
  });

  it("reports a cancel as an error carrying the reason, not as completion", async () => {
    let cancelReason: unknown;
    const source = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(4));
      },
      cancel(reason) {
        cancelReason = reason;
      },
    });
    let done = false;
    const errors: unknown[] = [];
    const wrapped = withByteProgress(source, {
      onBytes: () => {},
      onDone: () => {
        done = true;
      },
      onError: (err) => errors.push(err),
    });

    const reader = wrapped.getReader();
    await reader.read();
    await reader.cancel("abandoned");

    expect(cancelReason).toBe("abandoned");
    expect(done).toBe(false);
    expect(errors).toEqual(["abandoned"]);
  });

  it("synthesizes an AbortError when cancelled with no reason", async () => {
    const errors: unknown[] = [];
    const wrapped = withByteProgress(streamOf(new Uint8Array(4)), {
      onBytes: () => {},
      onError: (err) => errors.push(err),
    });

    const reader = wrapped.getReader();
    await reader.read();
    await reader.cancel();

    expect(errors).toHaveLength(1);
    expect((errors[0] as DOMException).name).toBe("AbortError");
  });

  it("reports a cancel landing mid-read once, as an error", async () => {
    const events: unknown[][] = [];
    // Never resolves a second read, so the cancel lands while the wrapper's
    // read of the source is genuinely in flight. That read then comes back as
    // `done` because of the cancel itself -- which must not read as a
    // completed transfer, and must not close an already-closed controller.
    const source = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(4));
      },
      pull() {
        return new Promise<void>(() => {});
      },
    });
    const wrapped = withByteProgress(source, {
      onBytes: (loaded) => events.push(["bytes", loaded]),
      onDone: () => events.push(["done"]),
      onError: (err) => events.push(["error", err]),
    });

    const reader = wrapped.getReader();
    await reader.read();
    const pending = reader.read();
    // A macrotask, so pull() has entered and is awaiting the source.
    await new Promise((resolve) => setTimeout(resolve, 0));
    await reader.cancel("abandoned");
    await pending;
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(events).toEqual([
      ["bytes", 4],
      ["error", "abandoned"],
    ]);
  });
});
