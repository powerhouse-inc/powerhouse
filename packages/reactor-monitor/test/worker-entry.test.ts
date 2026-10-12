import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

// Under `sideEffects: false` a bare import of `./worker` is tree-shaken away.
const pkgUrl = new URL("../package.json", import.meta.url);
const pkg = JSON.parse(readFileSync(pkgUrl, "utf8")) as {
  exports: Record<string, { source: string }>;
};
const workerExportUrl = new URL(pkg.exports["./worker"].source, pkgUrl);

function fakeScope() {
  return {
    name: "entry-test",
    addEventListener: vi.fn(),
    onconnect: null as ((event: MessageEvent) => void) | null,
  };
}

describe("@powerhousedao/reactor-monitor/worker", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does nothing on import and wires onconnect when started", async () => {
    const scope = fakeScope();
    vi.stubGlobal("self", scope);

    const mod = (await import(workerExportUrl.href)) as {
      startMonitorWorker?: unknown;
    };

    expect(typeof mod.startMonitorWorker).toBe("function");
    expect(scope.onconnect).toBeNull();
    expect(scope.addEventListener).not.toHaveBeenCalled();

    (mod.startMonitorWorker as () => void)();

    expect(typeof scope.onconnect).toBe("function");
    expect(scope.addEventListener).toHaveBeenCalledWith(
      "error",
      expect.any(Function),
    );
  });
});
