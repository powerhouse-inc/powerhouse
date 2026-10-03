/**
 * SharedWorker entry for a monitor-hosted reactor.
 *
 * One worker instance per reactor name (the name is set by the tab when it
 * constructs the `SharedWorker`), so N named reactors coexist in one origin.
 * The file is a real module in this package; apps consume it through the
 * tab-side wiring in `src/worker/client.ts`, which constructs it as
 * `new SharedWorker(new URL("./reactor-monitor.worker.js", import.meta.url),
 * { type: "module" })` so a bundler can see and emit it.
 *
 * Modelled on `apps/connect/src/reactor.worker.ts` minus Renown crypto and
 * signing, PGlite major resolution and IndexedDB migration, the relational
 * store, vetra/workflow model bundling, and the `/__packages` subscription.
 * Everything testable lives in `host.ts` and `build-worker-reactor.ts`; this
 * file holds only what needs the worker global scope.
 */
import { createMonitorWorkerHost } from "./host.js";

console.info("[reactor-monitor.worker] module evaluating");

const workerName = (self as unknown as { name?: string }).name ?? "";

const { host } = createMonitorWorkerHost({
  workerName,
  importers: {
    importPackage: (url) =>
      import(/* @vite-ignore */ url) as Promise<Record<string, unknown>>,
    importSource: (source) =>
      import(
        /* @vite-ignore */ URL.createObjectURL(
          new Blob([source], { type: "text/javascript" }),
        )
      ) as Promise<Record<string, unknown>>,
  },
});

type WorkerGlobalErrorEvent = {
  message?: string;
  error?: unknown;
  reason?: unknown;
};

const globalScope = self as unknown as {
  addEventListener: (
    type: "error" | "unhandledrejection",
    listener: (event: WorkerGlobalErrorEvent) => void,
  ) => void;
  onconnect: ((event: MessageEvent) => void) | null;
};

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
