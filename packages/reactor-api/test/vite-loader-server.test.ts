import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { startViteServer } from "../src/packages/vite-loader.mjs";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("the package loader's Vite server", () => {
  it("keeps its own cache and binds no HMR port, beside a project's Studio", async () => {
    const root = mkdtempSync(join(tmpdir(), "vite-loader-"));
    roots.push(root);
    writeFileSync(join(root, "package.json"), `{"name":"loader-fixture"}`);
    const server = await startViteServer(root);
    try {
      expect(server.config.cacheDir).toBe(
        join(root, "node_modules", ".vite-reactor"),
      );
      expect(server.config.server.hmr).toBe(false);
      expect(server.config.optimizeDeps.noDiscovery).toBe(true);
    } finally {
      await server.close();
    }
  });
});
