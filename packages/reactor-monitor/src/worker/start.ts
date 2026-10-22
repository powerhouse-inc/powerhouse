import { createMonitorWorkerHost } from "./host.js";

type WorkerGlobalErrorEvent = {
  message?: string;
  error?: unknown;
  reason?: unknown;
};

type MonitorWorkerScope = {
  name?: string;
  addEventListener: (
    type: "error" | "unhandledrejection",
    listener: (event: WorkerGlobalErrorEvent) => void,
  ) => void;
  onconnect: ((event: MessageEvent) => void) | null;
};

/**
 * Starts the SharedWorker side of a monitor-hosted reactor.
 *
 * One worker instance per reactor name (the name is set by the tab when it
 * constructs the `SharedWorker`), so N named reactors coexist in one origin.
 * Exported as `@powerhousedao/reactor-monitor/worker` with no import-time
 * effects: an app's worker entry imports and calls it, because a bare import
 * is dropped under this package's `sideEffects: false`.
 *
 * Modelled on `apps/connect/src/reactor.worker.ts` minus Renown crypto and
 * signing, PGlite major resolution and IndexedDB migration, the relational
 * store, vetra/workflow model bundling, and the `/__packages` subscription.
 * Everything testable lives in `host.ts` and `build-worker-reactor.ts`; this
 * function holds only what needs the worker global scope.
 */
export function startMonitorWorker(
  globalScope = self as unknown as MonitorWorkerScope,
): void {
  console.info("[reactor-monitor.worker] module evaluating");

  const workerName = globalScope.name ?? "";

  const { host } = createMonitorWorkerHost({
    workerName,
    importers: {
      importPackage: (url) =>
        import(/* @vite-ignore */ url) as Promise<Record<string, unknown>>,
    },
  });

  globalScope.addEventListener("error", (event) => {
    console.error(
      "[reactor-monitor.worker] uncaught error",
      event.message ?? event.error ?? event,
    );
  });
  globalScope.addEventListener("unhandledrejection", (event) => {
    console.error("[reactor-monitor.worker] unhandled rejection", event.reason);
  });

  globalScope.onconnect = (event) => {
    // `.at()` rather than `[0]`: a connect event with no port is a browser bug,
    // but reading it as possibly-absent is free and keeps the guard honest.
    const port = event.ports.at(0);
    if (!port) {
      return;
    }
    try {
      host.connectPort(port);
    } catch (error) {
      console.error("[reactor-monitor.worker] failed to connect port", error);
    }
  };
}
