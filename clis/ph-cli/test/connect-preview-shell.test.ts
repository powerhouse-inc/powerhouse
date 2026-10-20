import {
  APP_SHELLS_FILE,
  appShellVariantOf,
  injectAppShell,
} from "@powerhousedao/builder-tools";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ConnectServeOverride } from "../src/services/connect-preview.js";
import { runConnectPreview } from "../src/services/connect-preview.js";
import type { ConnectPreviewArgs } from "../src/types.js";

const PROJECT = resolve(__dirname, "../../../test/test-consumer-project");
const GENERIC = "@powerhousedao/connect/plugins/generic";

const name = (text: string) =>
  `<!--ph-shell:app-name-->${text}<!--/ph-shell:app-name-->`;

const shells = {
  generic: {
    body: `<div data-ph-shell="generic"><nav id="sidebar"></nav></div>`,
    head: `<style data-ph-shell="generic"></style><script data-ph-shell="generic"></script>`,
  },
  core: {
    body: `<div data-ph-shell="core"><header><a href="/">${name("Connect")}</a><a href="/settings">S</a></header></div>`,
    head: `<style data-ph-shell="core"></style><script data-ph-shell="core"></script>`,
  },
};

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

let dist: string;
beforeAll(() => {
  dist = mkdtempSync(join(tmpdir(), "ph-preview-shell-"));
  mkdirSync(dist, { recursive: true });
  // As `ph connect build` writes it without a composition: the generic shell baked in.
  const page = `<!doctype html><html><head></head><body><div id="root"></div></body></html>`;
  writeFileSync(join(dist, "index.html"), injectAppShell(page, shells.generic));
  writeFileSync(join(dist, APP_SHELLS_FILE), JSON.stringify(shells));
  writeFileSync(join(dist, "powerhouse.config.json"), "{}");
});
afterAll(() => rmSync(dist, { recursive: true, force: true }));

async function servedPage(override: ConnectServeOverride, path = "/") {
  const port = await freePort();
  const server = await runConnectPreview(
    {
      outDir: dist,
      port,
      host: "127.0.0.1",
      strictPort: true,
    } as ConnectPreviewArgs,
    override,
    PROJECT,
  );
  try {
    const res = await fetch(`http://127.0.0.1:${port}${path}`);
    return await res.text();
  } finally {
    await server.close();
  }
}

describe("ph connect preview: the shell follows the served composition", () => {
  it("serves core's shell for a composition without the generic plugin", async () => {
    const html = await servedPage({ connect: { composition: [] } });
    expect(appShellVariantOf(html)).toBe("core");
    expect(html).toContain("<header>");
    expect(html).not.toContain("sidebar");
    // SPA routes get the same page.
    const route = await servedPage(
      { connect: { composition: [{ module: "./mine.js" }] } },
      "/d/some-drive",
    );
    expect(appShellVariantOf(route)).toBe("core");
  }, 60_000);

  it("keeps the generic shell with the generic plugin, or with no composition", async () => {
    const withGeneric = await servedPage({
      connect: { composition: [{ module: GENERIC }] },
    });
    expect(appShellVariantOf(withGeneric)).toBe("generic");
    const classic = await servedPage({
      connect: { drives: { defaultDrives: [] } } as never,
    });
    expect(appShellVariantOf(classic)).toBe("generic");
  }, 60_000);

  it("titles core's shell with the served app name: the baked one, else the override's", async () => {
    writeFileSync(
      join(dist, "powerhouse.config.json"),
      JSON.stringify({ connect: { branding: { appName: "Lab Docs" } } }),
    );
    try {
      const baked = await servedPage({ connect: { composition: [] } });
      expect(baked).toContain(name("Lab Docs"));
      const renamed = await servedPage({
        connect: { composition: [], branding: { appName: "Desk & Co" } },
      });
      expect(renamed).toContain(name("Desk &amp; Co"));
    } finally {
      writeFileSync(join(dist, "powerhouse.config.json"), "{}");
    }
    // No branding name: the app's own fallback.
    expect(await servedPage({ connect: { composition: [] } })).toContain(
      name("Connect"),
    );
  }, 60_000);
});
