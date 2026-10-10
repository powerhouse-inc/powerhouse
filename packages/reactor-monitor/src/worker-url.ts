/**
 * Where the package's own SharedWorker entry lives.
 *
 * A literal `new URL("./<file>.js", import.meta.url)` is the form bundlers
 * statically recognize, and the `.js` specifier resolves to the `.ts` sibling
 * under vite's TypeScript resolution — the same shape
 * `apps/connect/src/reactor-worker-client.ts` uses for its own worker. The
 * module sits at `src/` (not `src/worker/`) so the relative path is right
 * both from the source tree and from the bundled `dist/` chunk, where the
 * worker entry is emitted at `dist/worker/`.
 *
 * It is still only a best-effort default. A bundler emits a worker chunk when
 * it can see `new Worker(new URL("./literal", import.meta.url))` at the
 * construction site, and this library constructs its worker from a resolved
 * variable, which no bundler can follow. An app that bundles the monitor for
 * production therefore owns the worker's URL, exactly as Connect does for its
 * prebuilt worker. Two ways, in order of preference:
 *
 * ```ts
 * // 1. Hand the library the worker. One literal line the bundler can see.
 * provision({
 *   kind: "worker",
 *   name: "alpha",
 *   createWorker: (name) =>
 *     new SharedWorker(new URL("./reactor-monitor.worker.js", import.meta.url), {
 *       name,
 *       type: "module",
 *     }),
 * });
 *
 * // 2. Or point it at a URL you serve, and re-export the entry from a module
 * //    beside it so your bundler emits it:
 * //    app/src/reactor-monitor.worker.ts:
 * //      import "@powerhousedao/reactor-monitor/worker";
 * provision({ kind: "worker", name: "alpha", workerUrl: "/reactor-monitor.worker.js" });
 * ```
 */
export function reactorMonitorWorkerUrl(): URL {
  return new URL("./worker/reactor-monitor.worker.js", import.meta.url);
}
