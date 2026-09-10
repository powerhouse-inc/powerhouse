import { track } from "../services/openpanel/buffer.js";
import type { PHGlobal } from "@powerhousedao/reactor-browser";

/**
 * Startup performance measurement.
 *
 * Captures First Contentful Paint (FCP) and Largest Contentful Paint (LCP) via
 * the Performance API and reports each to the OpenPanel analytics buffer (a
 * consent-gated, never-throwing queue) and the console. Call
 * {@link initPerformanceObserver} at the very top of the entry module, before
 * the runtime config is fetched, so FCP is caught even if the browser has
 * already painted — a `PerformanceObserver` with `buffered: true` replays
 * entries that fired before `observe()` was called.
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
 * writes to an already-existing `window.ph` (owned by main.tsx) — never
 * creates or replaces it, so it can't clobber the app's global state.
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

  try {
    console.info(`[connect:performance] ${name}: ${value}ms`, props);
  } catch {
    // console is best-effort only
  }

  try {
    track(`performance.${name}`, props);
  } catch {
    // analytics must never throw into the app
  }
}

export function initPerformanceObserver(): void {
  if (
    typeof window === "undefined" ||
    typeof PerformanceObserver === "undefined"
  ) {
    return;
  }

  // FCP — from the "paint" buffer.
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.name === "first-contentful-paint") {
          report("first_contentful_paint", entry.startTime);
        }
      }
    }).observe({ type: "paint", buffered: true });
  } catch (err) {
    console.warn("[connect:performance] FCP observer failed:", err);
  }

  // LCP — the final value only settles on an interaction or page hide, so latch
  // the latest candidate and report on the first terminal signal.
  let lcpMs = 0;
  let lcpObserver: PerformanceObserver | undefined;
  const reportLcp = (): void => {
    if (lcpMs > 0) report("largest_contentful_paint", lcpMs);
    lcpObserver?.disconnect();
  };
  try {
    lcpObserver = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      if (entries.length > 0) {
        lcpMs = entries[entries.length - 1].startTime;
      }
    });
    lcpObserver.observe({ type: "largest-contentful-paint", buffered: true });
    window.addEventListener("pagehide", reportLcp, { once: true });
    window.addEventListener(
      "visibilitychange",
      () => {
        if (document.visibilityState === "hidden") reportLcp();
      },
      { once: true },
    );
    window.addEventListener("pointerdown", reportLcp, { once: true });
    window.addEventListener("keydown", reportLcp, { once: true });
  } catch (err) {
    console.warn("[connect:performance] LCP observer failed:", err);
  }
}
