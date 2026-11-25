import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runConnectPreview } from "../src/services/connect-preview.js";
import { runConnectServer } from "@powerhousedao/ph-run/connect-server";
import type { ConnectPreviewArgs } from "../src/types.js";

// A built Connect is served two ways; `runner.serveFiles` (C1 M4) must not
// depend on which.
const SERVERS = [
  ["vite preview", runConnectPreview],
  ["the built-in server", runConnectServer],
] as const;

const PROJECT = resolve(__dirname, "../../../test/test-consumer-project");

function freePort(): Promise<number> {
  return new Promise((done, fail) => {
    const srv = createServer();
    srv.once("error", fail);
    srv.listen(0, "127.0.0.1", () => {
      const address = srv.address();
      const port = typeof address === "object" && address ? address.port : 0;
      srv.close(() => done(port));
    });
  });
}

let root: string;
let file: string;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "ph-preview-serve-files-"));
  writeFileSync(join(root, "index.html"), "<!doctype html><title>app</title>");
  writeFileSync(join(root, "powerhouse.config.json"), "{}");
  file = join(root, "studio.config.json");
});
afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe.each(SERVERS)("%s with runner.serveFiles", (_name, serve) => {
  it("serves the file as it reads now, no-store; a 404 while it is missing", async () => {
    const port = await freePort();
    const running = await serve(
      {
        outDir: root,
        port,
        host: "127.0.0.1",
        strictPort: true,
      } as ConnectPreviewArgs,
      {},
      PROJECT,
      { serveFiles: { "/studio.config.json": file } },
    );
    const at = (path: string, accept = "text/html,*/*") =>
      fetch(`http://127.0.0.1:${port}${path}`, { headers: { accept } });
    try {
      const missing = await at("/studio.config.json");
      expect(missing.status).toBe(404);
      expect(missing.headers.get("cache-control")).toBe("no-store");
      expect(await missing.text()).not.toContain("<title>app</title>");

      writeFileSync(file, JSON.stringify({ studioOrigin: "one" }));
      const served = await at("/studio.config.json", "application/json");
      expect(served.status).toBe(200);
      expect(served.headers.get("cache-control")).toBe("no-store");
      expect(await served.json()).toEqual({ studioOrigin: "one" });
      writeFileSync(file, JSON.stringify({ studioOrigin: "two" }));
      expect(await (await at("/studio.config.json")).json()).toEqual({
        studioOrigin: "two",
      });

      expect(await (await at("/")).text()).toContain("<title>app</title>");
    } finally {
      await running.close();
      rmSync(file, { force: true });
    }
  }, 60_000);
});
