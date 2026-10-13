import EventEmitter from "node:events";
import { resolve } from "node:path";
import type { ViteDevServer } from "vite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VitePackageLoader } from "../src/packages/vite-loader.mjs";

function fakeVite() {
  const watcher = new EventEmitter();
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
    ssrLoadModule: () => Promise.resolve({}),
    watcher,
  } as unknown as ViteDevServer;
  return { vite, watcher };
}

const PKG_A = resolve("/acme/pkg-a");
const PKG_B = resolve("/acme/pkg-b");

describe("VitePackageLoader change listeners", () => {
  const unhandled: unknown[] = [];
  const capture = (reason: unknown) => {
    unhandled.push(reason);
  };

  beforeEach(() => {
    unhandled.length = 0;
    process.on("unhandledRejection", capture);
  });

  afterEach(() => {
    process.off("unhandledRejection", capture);
    vi.useRealTimers();
  });

  it("reports both packages when they change within 500 ms", async () => {
    vi.useFakeTimers();
    const { vite, watcher } = fakeVite();
    const loader = VitePackageLoader.build(vite);
    const onA = vi.fn();
    const onB = vi.fn();
    loader.onDocumentModelsChange(PKG_A, onA);
    loader.onDocumentModelsChange(PKG_B, onB);

    watcher.emit("change", resolve(PKG_A, "document-models/a/index.ts"));
    await vi.advanceTimersByTimeAsync(100);
    watcher.emit("change", resolve(PKG_B, "document-models/b/index.ts"));
    await vi.advanceTimersByTimeAsync(5000);

    expect(onA).toHaveBeenCalledExactlyOnceWith([]);
    expect(onB).toHaveBeenCalledExactlyOnceWith([]);
  });

  it("loads once for a burst of file events", async () => {
    vi.useFakeTimers();
    const { vite, watcher } = fakeVite();
    const ssrLoadModule = vi.spyOn(vite, "ssrLoadModule");
    const loader = VitePackageLoader.build(vite);
    const handler = vi.fn();
    loader.onSubgraphsChange(PKG_A, handler);

    for (const file of ["a.ts", "b.ts", "c.ts", "d.ts"]) {
      watcher.emit("change", resolve(PKG_A, "subgraphs", file));
      await vi.advanceTimersByTimeAsync(20);
    }
    await vi.advanceTimersByTimeAsync(1000);

    expect(ssrLoadModule).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledOnce();
  });

  it("reports a failed reload through reportError", async () => {
    const { vite, watcher } = fakeVite();
    const reportError = vi.fn();
    const loader = VitePackageLoader.build(vite, { reportError });
    const failure = new Error("handler failed");
    loader.onSubgraphsChange(PKG_A, () => {
      throw failure;
    });

    watcher.emit("change", resolve(PKG_A, "subgraphs", "index.ts"));

    await vi.waitFor(() =>
      expect(reportError).toHaveBeenCalledExactlyOnceWith(failure),
    );
  });

  it("contains a handler that throws", async () => {
    const { vite, watcher } = fakeVite();
    const loader = VitePackageLoader.build(vite);
    const handler = vi.fn(() => {
      throw new Error("handler failed");
    });
    loader.onSubgraphsChange(PKG_A, handler);
    loader.onProcessorsChange(PKG_A, handler);
    loader.onPiecesChange(PKG_A, handler);
    loader.onDocumentModelsChange(PKG_A, handler);

    for (const dir of [
      "subgraphs",
      "processors",
      "pieces",
      "document-models",
    ]) {
      watcher.emit("change", resolve(PKG_A, dir, "index.ts"));
    }
    await vi.waitFor(() => expect(handler).toHaveBeenCalledTimes(4));
    await new Promise<void>((done) => setImmediate(done));

    expect(unhandled).toEqual([]);
  });
});
