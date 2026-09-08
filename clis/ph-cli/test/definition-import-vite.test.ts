import { describe, expect, it, vi } from "vitest";
import { ViteTypeScriptSourceImportAdapter } from "../src/services/definition-import-vite.js";

const revision = (character: string) =>
  `sha256:${character.repeat(64)}` as `sha256:${string}`;

describe("ViteTypeScriptSourceImportAdapter", () => {
  it("reuses one environment for every root in a package revision", async () => {
    const ssrLoadModule = vi.fn((specifier: string) =>
      Promise.resolve({ specifier }),
    );
    const close = vi.fn(() => Promise.resolve());
    const factory = vi.fn(() => Promise.resolve({ ssrLoadModule, close }));
    const adapter = new ViteTypeScriptSourceImportAdapter(factory);

    await adapter.importModule({
      packageRoot: "/package",
      specifier: "./src/a.ts",
      packageRevision: revision("a"),
    });
    await adapter.importModule({
      packageRoot: "/package",
      specifier: "./src/b.ts",
      packageRevision: revision("a"),
    });

    expect(factory).toHaveBeenCalledTimes(1);
    expect(ssrLoadModule).toHaveBeenCalledTimes(2);
    await adapter.close();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("does not begin an import after cancellation", async () => {
    const factory = vi.fn(() =>
      Promise.resolve({
        ssrLoadModule: vi.fn(() => Promise.resolve({})),
        close: vi.fn(() => Promise.resolve()),
      }),
    );
    const controller = new AbortController();
    controller.abort();
    const adapter = new ViteTypeScriptSourceImportAdapter(factory);

    await expect(
      adapter.importModule({
        packageRoot: "/package",
        specifier: "./src/a.ts",
        packageRevision: revision("a"),
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(factory).not.toHaveBeenCalled();
  });
});
