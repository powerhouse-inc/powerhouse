// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearOpenPanelBuffer,
  drainOpenPanelBuffer,
} from "../../src/services/openpanel/buffer.js";
import { initPerformanceObserver } from "../../src/utils/performance-observer.js";

/**
 * `PerformanceObserver` is the one thing here that has to be faked — happy-dom
 * has no paint or LCP timeline. Everything else is the real module: the events
 * are real DOM events and the metrics are read back through the real OpenPanel
 * buffer, so what these tests assert is what the analytics backend receives.
 */
type ObserverCallback = (list: {
  getEntries: () => Array<{ name?: string; startTime: number }>;
}) => void;

type FakeEntry = { name?: string; startTime: number };

let observers: Array<{
  type: string;
  cb: ObserverCallback;
  live: boolean;
  pending: FakeEntry[];
}> = [];

class FakePerformanceObserver {
  constructor(private readonly cb: ObserverCallback) {}
  observe(options: { type: string }) {
    observers.push({
      type: options.type,
      cb: this.cb,
      live: true,
      pending: [],
    });
  }
  disconnect() {
    for (const o of observers) if (o.cb === this.cb) o.live = false;
  }
  /** Real observers hand back the entries buffered since the last callback. */
  takeRecords(): FakeEntry[] {
    const drained: FakeEntry[] = [];
    for (const o of observers) {
      if (o.cb !== this.cb) continue;
      drained.push(...o.pending);
      o.pending = [];
    }
    return drained;
  }
}

function emit(type: string, entries: FakeEntry[]): void {
  for (const o of observers) {
    if (o.type === type && o.live) o.cb({ getEntries: () => entries });
  }
}

/**
 * Buffers entries in the observer WITHOUT running its callback — the state a
 * real observer is in between an entry being recorded and the task that
 * delivers it. `takeRecords()` is the only way to see them.
 */
function queue(type: string, entries: FakeEntry[]): void {
  for (const o of observers) {
    if (o.type === type && o.live) o.pending.push(...entries);
  }
}

/**
 * Everything the module tracked, collected through the real OpenPanel buffer.
 * The fake client is installed once per test (`drainOpenPanelBuffer` is what
 * the app calls after consent), so events arrive here as they are tracked.
 */
let tracked: Array<[string, Record<string, unknown> | undefined]> = [];

function reportsFor(
  metric: string,
): Array<Record<string, unknown> | undefined> {
  return tracked
    .filter(([name]) => name === `performance.${metric}`)
    .map(([, props]) => props);
}

function setVisibility(state: "visible" | "hidden"): void {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => state,
  });
}

let disposers: Array<() => void> = [];

beforeEach(() => {
  observers = [];
  disposers = [];
  tracked = [];
  clearOpenPanelBuffer();
  drainOpenPanelBuffer({
    track: (name: string, props?: Record<string, unknown>) => {
      tracked.push([name, props]);
    },
  });
  window.ph = {};
  setVisibility("visible");
  vi.stubGlobal("PerformanceObserver", FakePerformanceObserver);
});

afterEach(() => {
  for (const dispose of disposers) dispose();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function init(): void {
  disposers.push(initPerformanceObserver());
}

describe("initPerformanceObserver", () => {
  it("reports the first contentful paint, rounded to whole milliseconds", () => {
    init();

    emit("paint", [{ name: "first-contentful-paint", startTime: 776.4 }]);

    expect(reportsFor("first_contentful_paint")).toEqual([{ ms: 776 }]);
  });

  it("ignores paint entries other than the first contentful paint", () => {
    init();

    emit("paint", [{ name: "first-paint", startTime: 100 }]);

    expect(reportsFor("first_contentful_paint")).toEqual([]);
  });

  it("mirrors each metric on window.ph.performance for devtools", () => {
    init();

    emit("paint", [{ name: "first-contentful-paint", startTime: 512.7 }]);

    expect(
      (window.ph as { performance?: Record<string, number> }).performance,
    ).toEqual({ first_contentful_paint: 513 });
  });

  it("reports the largest contentful paint once, not once per terminal signal", () => {
    // The LCP value only settles on an interaction or a page hide, so the
    // module listens for several. Firing more than one must not send the
    // metric more than once — every duplicate is a double-count downstream.
    init();
    emit("largest-contentful-paint", [{ startTime: 1234.6 }]);

    window.dispatchEvent(new Event("pointerdown"));
    setVisibility("hidden");
    document.dispatchEvent(new Event("visibilitychange", { bubbles: true }));
    window.dispatchEvent(new Event("pagehide"));

    expect(reportsFor("largest_contentful_paint")).toEqual([{ ms: 1235 }]);
  });

  it("latches the newest LCP candidate", () => {
    init();

    emit("largest-contentful-paint", [{ startTime: 100 }]);
    emit("largest-contentful-paint", [{ startTime: 300 }, { startTime: 900 }]);
    window.dispatchEvent(new Event("pointerdown"));

    expect(reportsFor("largest_contentful_paint")).toEqual([{ ms: 900 }]);
  });

  it("reports the LCP when the page hides after having been visible", () => {
    // A page that loads in a background tab, or that the user tabs away from
    // and back, fires visibilitychange more than once. Only the transition to
    // "hidden" is the terminal signal — an earlier "visible" one must not
    // consume the listener.
    init();
    emit("largest-contentful-paint", [{ startTime: 640 }]);

    setVisibility("visible");
    document.dispatchEvent(new Event("visibilitychange", { bubbles: true }));
    expect(reportsFor("largest_contentful_paint")).toEqual([]);

    setVisibility("hidden");
    document.dispatchEvent(new Event("visibilitychange", { bubbles: true }));
    expect(reportsFor("largest_contentful_paint")).toEqual([{ ms: 640 }]);
  });

  it("reports the LCP candidate still queued in the observer", () => {
    // A PerformanceObserver delivers entries in a task of its own. An
    // interaction early in the page's life lands before that task runs, so the
    // newest candidate is sitting in the observer's buffer rather than in the
    // latched value. Disconnecting without draining it loses LCP for the whole
    // session — silently, since there is nothing left to report.
    init();

    queue("largest-contentful-paint", [{ startTime: 480.2 }]);
    window.dispatchEvent(new Event("pointerdown"));

    expect(reportsFor("largest_contentful_paint")).toEqual([{ ms: 480 }]);
  });

  it("prefers a queued LCP candidate over an older delivered one", () => {
    init();

    emit("largest-contentful-paint", [{ startTime: 300 }]);
    queue("largest-contentful-paint", [{ startTime: 950 }]);
    window.dispatchEvent(new Event("pagehide"));

    expect(reportsFor("largest_contentful_paint")).toEqual([{ ms: 950 }]);
  });

  it("reports no LCP when no candidate was ever observed", () => {
    init();

    window.dispatchEvent(new Event("pagehide"));

    expect(reportsFor("largest_contentful_paint")).toEqual([]);
  });

  it("stops reporting once disposed", () => {
    const dispose = initPerformanceObserver();

    dispose();
    emit("paint", [{ name: "first-contentful-paint", startTime: 300 }]);
    emit("largest-contentful-paint", [{ startTime: 800 }]);
    window.dispatchEvent(new Event("pagehide"));

    expect(tracked).toEqual([]);
  });

  it("keeps the console quiet in a production build", () => {
    // The console summary is a developer aid. In production it is noise in
    // every user's console and in every support screenshot.
    vi.stubEnv("PROD", true);
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    init();

    emit("paint", [{ name: "first-contentful-paint", startTime: 776 }]);

    expect(info).not.toHaveBeenCalled();
    // The metric still reaches analytics — only the logging is gated.
    expect(reportsFor("first_contentful_paint")).toEqual([{ ms: 776 }]);
  });

  it("logs the console summary outside a production build", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    init();

    emit("paint", [{ name: "first-contentful-paint", startTime: 776 }]);

    expect(info).toHaveBeenCalledWith(
      "[connect:performance] first_contentful_paint: 776ms",
      { ms: 776 },
    );
  });

  it("does nothing when the PerformanceObserver API is missing", () => {
    vi.stubGlobal("PerformanceObserver", undefined);

    expect(() => initPerformanceObserver()()).not.toThrow();
  });
});
