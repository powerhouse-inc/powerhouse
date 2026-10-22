import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "vite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { devReactImportmapPlugin, devUrlOf } from "./dev-external-react.js";

describe("devUrlOf", () => {
  // A host's dev server keeps its own Vite cache, so the shim can't assume .vite.
  it("addresses a host's own dep cache under the root", () => {
    expect(devUrlOf("/p", "/p/node_modules/.vite-connect/deps/react.js")).toBe(
      "node_modules/.vite-connect/deps/react.js",
    );
  });

  it("goes through /@fs/ for a cache outside the root", () => {
    expect(devUrlOf("/p/app", "/cache/deps/react.js")).toBe(
      "/@fs/cache/deps/react.js",
    );
  });
});

describe("the dev import map's shared deps", () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "dev-shared-deps-"));
    const pkg = join(root, "node_modules/document-model");
    mkdirSync(pkg, { recursive: true });
    writeFileSync(
      join(pkg, "package.json"),
      `{"name":"document-model","type":"module","exports":{".":"./index.js"}}`,
    );
    writeFileSync(join(pkg, "index.js"), `export const model = "shared";`);
    writeFileSync(join(root, "package.json"), `{"name":"project"}`);
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  // A registry package's build leaves document-model bare; dev must resolve it to Connect's copy.
  it("maps each shared dep to a module re-exporting the copy Connect imports", async () => {
    const server = await createServer({
      root,
      logLevel: "silent",
      server: { port: 0, hmr: false },
      optimizeDeps: { noDiscovery: true, include: [] },
      plugins: [await devReactImportmapPlugin(root, false)],
    });
    try {
      const html = await server.transformIndexHtml(
        "/",
        `<html><head><script type="importmap">{}</script></head><body></body></html>`,
      );
      const map = JSON.parse(
        /<script type="importmap">([\s\S]*?)<\/script>/.exec(html)![1],
      ) as { imports: Record<string, string> };
      const shim = map.imports["document-model"];
      expect(shim).toBe("/@id/__x00__ph-shared:document-model");
      expect(map.imports["document-model/"]).toBe(`${shim}/`);

      // As the browser asks for it: the import map's URL, through the dev server.
      await server.listen();
      const { port } = server.httpServer!.address() as AddressInfo;
      const code = await (
        await fetch(`http://localhost:${port}${shim}`)
      ).text();
      expect(code).toContain("/node_modules/document-model/index.js");
      expect(code).not.toMatch(/from\s+"document-model"/);
    } finally {
      await server.close();
    }
  });
});
