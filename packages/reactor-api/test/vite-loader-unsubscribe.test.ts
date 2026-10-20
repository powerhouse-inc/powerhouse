import EventEmitter from "node:events";
import { resolve } from "node:path";
import type { ViteDevServer } from "vite";
import { afterEach, describe, expect, it, vi } from "vitest";
import { VitePackageLoader } from "../src/packages/vite-loader.mjs";

function fakeVite() {
  const watcher = new EventEmitter();
  let open = () => {};
  const loaded = new Promise<Record<string, unknown>>((done) => {
    open = () => done({});
  });
  const vite = {
    config: { resolve: { alias: [] } },
    environments: {
      ssr: {
        pluginContainer: {
          resolveId: (specifier: string) =>
            Promise.resolve({ id: specifier, external: false }),
        },
      },
    },
    ssrLoadModule: vi.fn(() => loaded),
    watcher,
  } as unknown as ViteDevServer & {
    ssrLoadModule: ReturnType<typeof vi.fn>;
  };
  return { vite, watcher, finishLoad: () => open() };
}

const PKG_A = resolve("/acme/pkg-a");

const subscriptions = [
  ["onDocumentModelsChange", "document-models"],
  ["onSubgraphsChange", "subgraphs"],
  ["onProcessorsChange", "processors"],
  ["onPiecesChange", "pieces"],
] as const;

describe("VitePackageLoader unsubscribe", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it.each(subscriptions)(
    "%s: unsubscribing cancels a pending reload",
    async (subscribe, dir) => {
      vi.useFakeTimers();
      const { vite, watcher, finishLoad } = fakeVite();
      finishLoad();
      const loader = VitePackageLoader.build(vite);
      const handler = vi.fn();
      const unsubscribe = loader[subscribe](PKG_A, handler);

      watcher.emit("change", resolve(PKG_A, dir, "index.ts"));
      await vi.advanceTimersByTimeAsync(50);
      unsubscribe();
      await vi.advanceTimersByTimeAsync(5000);

      expect(vite.ssrLoadModule).not.toHaveBeenCalled();
      expect(handler).not.toHaveBeenCalled();
    },
  );

  it.each(subscriptions)(
    "%s: a reload in flight at unsubscribe does not call the handler",
    async (subscribe, dir) => {
      vi.useFakeTimers();
      const { vite, watcher, finishLoad } = fakeVite();
      const loader = VitePackageLoader.build(vite);
      const handler = vi.fn();
      const unsubscribe = loader[subscribe](PKG_A, handler);

      watcher.emit("change", resolve(PKG_A, dir, "index.ts"));
      await vi.advanceTimersByTimeAsync(100);
      expect(vite.ssrLoadModule).toHaveBeenCalled();
      unsubscribe();
      finishLoad();
      await vi.runAllTimersAsync();

      expect(handler).not.toHaveBeenCalled();
    },
  );
});
