import { track } from "../services/openpanel/buffer.js";
import type { PHGlobal } from "@powerhousedao/reactor-browser";

/**
 * Startup performance measurement.
 *
 * Captures First Contentful Paint (FCP) and Largest Contentful Paint (LCP) via
 * the Performance API and reports each to the OpenPanel analytics buffer (a
 * consent-gated, never-throwing queue). Call {@link initPerformanceObserver}
 * at the very top of the entry module, before the runtime config is fetched,
 * so FCP is caught even if the browser has already painted — a
 * `PerformanceObserver` with `buffered: true` replays entries that fired
 * before `observe()` was called.
 *
 * This module is intentionally dependency-light (only the OpenPanel event
 * buffer, which has no runtime imports of its own) so it is safe to load
 * before the runtime config is fetched. Every API access is guarded: nothing
 * here may throw into the application.
 */

function navigationType(): string | undefined {
  try {
    const entry = performance.getEntriesByType("navigation")[0] as
      | PerformanceNavigationTiming
      | undefined;
    return entry?.type; // "navigate" | "reload" | "back_forward" | "prerender"
  } catch {
    return undefined;
  }
}

// window.ph is the app's global bag (PHGlobal). This module owns a
// `performance` sub-object it writes into; `PhWithPerformance` is a named
// stand-in for that write so it type-checks without touching the shared
// PHGlobal definition.
type PhWithPerformance = PHGlobal & { performance?: Record<string, number> };

/**
 * Mirror the metric on `window.ph.performance` for devtools inspection. Only
 * writes to an already-existing `window.ph` (owned by the entry module) —
 * never creates or replaces it, so it can't clobber the app's global state.
 */
function storeOnWindow(name: string, value: number): void {
  try {
    const ph = window.ph as PhWithPerformance | undefined;
    if (!ph) return;
    ph.performance = ph.performance ?? {};
    ph.performance[name] = value;
  } catch {
    // devtools mirror is best-effort only
  }
}

function report(name: string, ms: number): void {
  const value = Math.round(ms);
  const props: Record<string, unknown> = { ms: value };
  const navType = navigationType();
  if (navType) props.navigation = navType;

  storeOnWindow(name, value);

  // The console summary is a developer aid. In a production build it is noise
  // in every user's console and in every support screenshot, so it is gated
  // out of the bundle there.
  if (!import.meta.env.PROD) {
    try {
      console.info(`[connect:performance] ${name}: ${value}ms`, props);
    } catch {
      // console is best-effort only
    }
  }

  try {
    track(`performance.${name}`, props);
  } catch {
    // analytics must never throw into the app
  }
}

/**
 * Starts the observers. Returns a disposer that detaches all of them. The app
 * never needs it — the observers live as long as the page does — but it keeps
 * the module testable and leaves no listener behind.
 */
export function initPerformanceObserver(): () => void {
  if (
    typeof window === "undefined" ||
    typeof PerformanceObserver === "undefined"
  ) {
    return () => undefined;
  }

  const teardown: Array<() => void> = [];

  /** Registers a listener and queues its removal on dispose. */
  const listen = (
    target: EventTarget,
    type: string,
    handler: () => void,
    once = true,
  ): void => {
    target.addEventListener(type, handler, { once });
    teardown.push(() => target.removeEventListener(type, handler));
  };

  // FCP — from the "paint" buffer. It fires once, so stop observing after it.
  try {
    const fcpObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.name === "first-contentful-paint") {
          fcpObserver.disconnect();
          report("first_contentful_paint", entry.startTime);
        }
      }
    });
    fcpObserver.observe({ type: "paint", buffered: true });
    teardown.push(() => fcpObserver.disconnect());
  } catch (err) {
    console.warn("[connect:performance] FCP observer failed:", err);
  }

  // LCP — the final value only settles on an interaction or page hide, so latch
  // the latest candidate and report on the first terminal signal.
  let lcpMs = 0;
  let lcpReported = false;
  let lcpObserver: PerformanceObserver | undefined;

  /** Latches the newest candidate of a batch. The last entry is the newest. */
  const latch = (entries: ArrayLike<{ startTime: number }>): void => {
    if (entries.length > 0) {
      lcpMs = entries[entries.length - 1].startTime;
    }
  };

  const reportLcp = (): void => {
    // Several terminal signals can fire in one session (a click, then the page
    // hiding, then pagehide). The metric is sent for the first one only: every
    // repeat would be a double-count downstream.
    if (lcpReported) return;
    lcpReported = true;

    // A PerformanceObserver delivers entries in a task of its own, so a
    // terminal signal early in the page's life arrives while the newest
    // candidate is still buffered. Drain it before disconnecting — otherwise
    // an early click costs the session its LCP entirely.
    try {
      latch(lcpObserver?.takeRecords() ?? []);
    } catch {
      // draining is best-effort; report whatever was already delivered
    }

    lcpObserver?.disconnect();
    if (lcpMs > 0) report("largest_contentful_paint", lcpMs);
  };

  try {
    lcpObserver = new PerformanceObserver((list) => {
      latch(list.getEntries());
    });
    lcpObserver.observe({ type: "largest-contentful-paint", buffered: true });
    teardown.push(() => lcpObserver?.disconnect());

    listen(window, "pagehide", reportLcp);
    listen(window, "pointerdown", reportLcp);
    listen(window, "keydown", reportLcp);
    // Not `once`: a page that loads in a background tab, or that the user tabs
    // away from and back, fires visibilitychange more than once, and only the
    // transition to "hidden" is terminal. A one-shot listener would be spent
    // on an earlier "visible" event and never see the hide.
    listen(
      document,
      "visibilitychange",
      () => {
        if (document.visibilityState === "hidden") reportLcp();
      },
      false,
    );
  } catch (err) {
    console.warn("[connect:performance] LCP observer failed:", err);
  }

  return () => {
    for (const detach of teardown) {
      try {
        detach();
      } catch {
        // teardown is best-effort only
      }
    }
    teardown.length = 0;
  };
}
