import type { ComponentType, PropsWithChildren, ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { loadRuntimeConfig } from "./runtime-config.js";
import { initPerformanceObserver } from "./utils/performance-observer.js";

/**
 * The two-phase startup shared by both entry points.
 *
 * Phase 1 paints the config-independent skeleton, so first contentful paint
 * does not wait on the `powerhouse.config.json` round-trip. Phase 2 awaits the
 * config and hands the caller back the root to render the config-dependent app
 * into — every module that reads the runtime config at module-evaluation
 * throws if the cache isn't warm, so the app graph may only be imported after
 * this resolves.
 *
 * Kept dependency-light on purpose: it loads before the config is fetched, so
 * nothing in its import graph may read the config.
 */

/** All the bootstrap needs of a React root — and all a test has to stand in for. */
type RenderTarget = { render: (node: ReactNode) => void };

export type BootDeps = {
  loadConfig: () => Promise<unknown>;
  importSkeleton: () => Promise<{ default: ComponentType<PropsWithChildren> }>;
  createRoot: () => RenderTarget;
  initObserver: () => () => void;
};

const defaultDeps: BootDeps = {
  loadConfig: () => loadRuntimeConfig(),
  importSkeleton: () => import("./components/app-skeleton.js"),
  createRoot: () => createRoot(document.getElementById("root")!),
  initObserver: initPerformanceObserver,
};

/**
 * Shown when startup cannot proceed. Deliberately built from plain elements:
 * this renders precisely when the runtime config is unavailable, so it must
 * not depend on anything that reads it.
 */
function BootError({ error }: { error: unknown }): ReactNode {
  const message = error instanceof Error ? error.message : String(error);
  return (
    <div
      role="alert"
      className="flex h-screen flex-col items-center justify-center gap-3 bg-background p-6 text-center"
    >
      <h1 className="text-lg font-semibold text-foreground">
        Connect could not start
      </h1>
      <p className="max-w-prose text-sm text-foreground">
        Its runtime configuration could not be loaded. This is usually temporary
        — reloading often resolves it.
      </p>
      <pre className="max-w-prose overflow-x-auto rounded-sm bg-card px-3 py-2 text-left text-xs text-foreground">
        {message}
      </pre>
      <button
        type="button"
        className="rounded-sm bg-card px-4 py-2 text-sm font-medium text-foreground shadow-sm"
        onClick={() => {
          window.location.reload();
        }}
      >
        Reload
      </button>
    </div>
  );
}

/**
 * Paints the skeleton, then waits for the runtime config.
 *
 * Returns the root to render the app into, or `null` when startup failed — in
 * which case the error state is already painted and the caller must not import
 * the config-dependent app. It resolves rather than rejecting on failure: both
 * entry points await this at their module's top level, where a rejection would
 * surface only as an unhandled rejection behind a skeleton that never goes
 * away.
 */
export async function bootConnect(
  overrides: Partial<BootDeps> = {},
): Promise<RenderTarget | null> {
  const {
    loadConfig,
    importSkeleton,
    createRoot: makeRoot,
    initObserver,
  } = { ...defaultDeps, ...overrides };

  if (!window.ph) {
    window.ph = {};
  }

  // Before anything else: the observers use `buffered: true`, so they catch
  // the browser's paint even when setup runs a tick after it fired.
  initObserver();

  // Started here and awaited at the bottom. The config fetch and the skeleton
  // chunk are independent round-trips, so they overlap; awaiting the chunk
  // first would put the config fetch — and with it everything the app needs —
  // behind it, which measured ~180ms of extra time-to-usable on a 150ms-RTT
  // connection. Mapping the rejection to a value here also means a config
  // failure is handled from the start, never an unhandled rejection.
  const config = loadConfig().then(
    () => ({ ok: true }) as const,
    (error: unknown) => ({ ok: false, error }) as const,
  );

  const root = makeRoot();

  try {
    const { default: AppSkeleton } = await importSkeleton();
    root.render(<AppSkeleton />);
  } catch (error) {
    console.error("[connect:boot] the app skeleton failed to load:", error);
    root.render(<BootError error={error} />);
    return null;
  }

  const result = await config;
  if (!result.ok) {
    console.error(
      "[connect:boot] the runtime config failed to load:",
      result.error,
    );
    root.render(<BootError error={result.error} />);
    return null;
  }

  return root;
}
