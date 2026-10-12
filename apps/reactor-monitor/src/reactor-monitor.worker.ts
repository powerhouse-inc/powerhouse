/**
 * Local entry for the reactor-monitor library's SharedWorker.
 *
 * This file exists so the bundler can see a literal
 * `new URL("./reactor-monitor.worker.js", import.meta.url)` at the
 * construction site in `provisioning.ts` — a bundler only emits a worker
 * chunk when it can see that literal pattern, and it cannot see through a
 * path resolved inside `@powerhousedao/reactor-monitor` itself. This is the
 * app-owned seam the library's `reactorMonitorWorkerUrl` doc describes;
 * see packages/reactor-monitor/src/worker-url.ts. It calls the start
 * function rather than importing for effect: the library is
 * `sideEffects: false`, so a bare import is tree-shaken to an empty chunk.
 */
import { startMonitorWorker } from "@powerhousedao/reactor-monitor/worker";

startMonitorWorker();
