import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLogger, normalizePath, type Logger } from "vite";
import { afterEach, describe, expect, it } from "vitest";
import { startViteServer } from "../src/packages/vite-loader.mjs";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function project(name: string): string {
  const root = mkdtempSync(join(tmpdir(), "vite-loader-"));
  roots.push(root);
  writeFileSync(join(root, "package.json"), JSON.stringify({ name }));
  return root;
}

function recordingLogger(errors: string[]): Logger {
  const logger = createLogger("silent");
  logger.error = (message) => void errors.push(message);
  return logger;
}

describe("the package loader's Vite server", () => {
  it("keeps its own cache and binds no HMR port, beside a project's Studio", async () => {
    const root = mkdtempSync(join(tmpdir(), "vite-loader-"));
    roots.push(root);
    writeFileSync(join(root, "package.json"), `{"name":"loader-fixture"}`);
    const server = await startViteServer(root);
    try {
      // Vite keeps the cache path with forward slashes, Windows included.
      expect(server.config.cacheDir).toBe(
        normalizePath(join(root, "node_modules", ".vite-reactor")),
      );
      expect(server.config.server.hmr).toBe(false);
      expect(server.config.optimizeDeps.noDiscovery).toBe(true);
    } finally {
      await server.close();
    }
  });

  it("opens no WebSocket port, so two projects' loaders run side by side", async () => {
    const errors: string[] = [];
    const first = await startViteServer(
      project("loader-one"),
      recordingLogger(errors),
    );
    const second = await startViteServer(
      project("loader-two"),
      recordingLogger(errors),
    );
    try {
      // Vite reports a taken WebSocket port asynchronously.
      await new Promise((resolve) => setTimeout(resolve, 500));
      expect(errors).toEqual([]);
    } finally {
      await first.close();
      await second.close();
    }
  });
});
