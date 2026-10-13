import { describe, it, expect, afterEach } from "vitest";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createConnectServer } from "../src/integrations/powerhouse/connect-server.js";

const cleanups: Array<() => Promise<void> | void> = [];

afterEach(async () => {
  for (const c of cleanups) await c();
  cleanups.length = 0;
});

function makeAssetsDir(indexHtml: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "connect-server-test-"));
  fs.writeFileSync(path.join(dir, "index.html"), indexHtml);
  cleanups.push(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function listen(server: http.Server): Promise<number> {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      cleanups.push(() => new Promise<void>((r) => server.close(() => r())));
      resolve((server.address() as { port: number }).port);
    });
  });
}

function httpGet(
  url: string,
): Promise<{
  status: number;
  body: string;
  headers: http.IncomingHttpHeaders;
}> {
  return new Promise((resolve, reject) => {
    http
      .get(url, (res) => {
        let body = "";
        res.on("data", (chunk: string) => {
          body += chunk;
        });
        res.on("end", () =>
          resolve({ status: res.statusCode!, body, headers: res.headers }),
        );
      })
      .on("error", reject);
  });
}

const DYNAMIC_BASE_HTML =
  `<!doctype html><html><head><meta charset="utf-8">` +
  `<link rel="stylesheet" href="/__PH_DYNAMIC_BASE__/assets/index.css">` +
  `<script type="module" src="/__PH_DYNAMIC_BASE__/assets/index.js"></script>` +
  `</head><body><div id="root"></div></body></html>`;

describe("createConnectServer", () => {
  it("throws when the assets dir has no index.html", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "connect-server-empty-"));
    cleanups.push(() => fs.rmSync(dir, { recursive: true, force: true }));
    expect(() => createConnectServer({ dir })).toThrow(/index\.html not found/);
  });

  it("substitutes the dynamic-base token + injects the global under a subpath base", async () => {
    const dir = makeAssetsDir(DYNAMIC_BASE_HTML);
    const port = await listen(createConnectServer({ dir, base: "/myagent/" }));

    const res = await httpGet(`http://127.0.0.1:${port}/`);
    expect(res.status).toBe(200);

    // Token fully replaced with the trailing-slash base.
    expect(res.body).not.toContain("/__PH_DYNAMIC_BASE__/");
    expect(res.body).toContain('href="/myagent/assets/index.css"');
    expect(res.body).toContain('src="/myagent/assets/index.js"');

    // Global injected with the trailing-slash base, before the entry bundle.
    expect(res.body).toContain(
      '<script>globalThis.__PH_DYNAMIC_BASE__="/myagent/";</script>',
    );
    const globalAt = res.body.indexOf("globalThis.__PH_DYNAMIC_BASE__=");
    const entryAt = res.body.indexOf('src="/myagent/assets/index.js"');
    expect(globalAt).toBeGreaterThanOrEqual(0);
    expect(globalAt).toBeLessThan(entryAt);
  });

  it('collapses the token to root with global "/" when no base is given', async () => {
    const dir = makeAssetsDir(DYNAMIC_BASE_HTML);
    const port = await listen(createConnectServer({ dir }));

    const res = await httpGet(`http://127.0.0.1:${port}/`);
    expect(res.status).toBe(200);
    expect(res.body).not.toContain("/__PH_DYNAMIC_BASE__/");
    expect(res.body).toContain('src="/assets/index.js"');
    expect(res.body).not.toContain("//assets");
    expect(res.body).toContain(
      '<script>globalThis.__PH_DYNAMIC_BASE__="/";</script>',
    );
  });

  it("keeps an existing __PH_DYNAMIC_BASE__ assignment instead of injecting another", async () => {
    const html =
      `<!doctype html><html><head>` +
      `<script>globalThis.__PH_DYNAMIC_BASE__="/preset/";</script>` +
      `<script type="module" src="/__PH_DYNAMIC_BASE__/assets/index.js"></script>` +
      `</head><body></body></html>`;
    const dir = makeAssetsDir(html);
    const port = await listen(createConnectServer({ dir, base: "/myagent/" }));

    const res = await httpGet(`http://127.0.0.1:${port}/`);
    expect(res.body.match(/globalThis\.__PH_DYNAMIC_BASE__\s*=/g)).toHaveLength(
      1,
    );
    expect(res.body).toContain('__PH_DYNAMIC_BASE__="/preset/"');
    expect(res.body).toContain('src="/myagent/assets/index.js"');
  });

  it("leaves a token-free (concrete-base) document untouched by the base step", async () => {
    const html =
      `<!doctype html><html><head>` +
      `<script type="module" src="/assets/index.js"></script>` +
      `</head><body></body></html>`;
    const dir = makeAssetsDir(html);
    const port = await listen(createConnectServer({ dir, base: "/myagent/" }));

    const res = await httpGet(`http://127.0.0.1:${port}/`);
    expect(res.body).not.toContain("__PH_DYNAMIC_BASE__");
    // Only the theme boot script is added; the base step changes nothing.
    expect(
      res.body.replace(/<script data-ph-theme-boot>.*?<\/script>/, ""),
    ).toBe(html);
  });

  it("injects the theme boot script at the top of <head>, before the entry bundle", async () => {
    const dir = makeAssetsDir(DYNAMIC_BASE_HTML);
    const port = await listen(createConnectServer({ dir, base: "/myagent/" }));

    const res = await httpGet(`http://127.0.0.1:${port}/`);
    expect(res.status).toBe(200);
    expect(res.body).toContain("<script data-ph-theme-boot>");
    // Persists ?theme= into ph:theme, honors system preference, toggles .dark.
    expect(res.body).toContain(`localStorage.setItem('ph:theme',p)`);
    expect(res.body).toContain("prefers-color-scheme: dark");
    expect(res.body).toContain(`classList.toggle('dark',d)`);
    const themeAt = res.body.indexOf("data-ph-theme-boot");
    const entryAt = res.body.indexOf('src="/myagent/assets/index.js"');
    expect(themeAt).toBeGreaterThanOrEqual(0);
    expect(themeAt).toBeLessThan(entryAt);
  });

  it("keeps an existing theme boot marker instead of injecting another", async () => {
    const html =
      `<!doctype html><html><head>` +
      `<script data-ph-theme-boot>/* build-time copy */</script>` +
      `<script type="module" src="/assets/index.js"></script>` +
      `</head><body></body></html>`;
    const dir = makeAssetsDir(html);
    const port = await listen(createConnectServer({ dir }));

    const res = await httpGet(`http://127.0.0.1:${port}/`);
    expect(res.body.match(/data-ph-theme-boot/g)).toHaveLength(1);
    expect(res.body).toContain("/* build-time copy */");
  });

  it("serves a static file under /assets/ with the immutable Cache-Control; missing asset 404s", async () => {
    const dir = makeAssetsDir(DYNAMIC_BASE_HTML);
    fs.mkdirSync(path.join(dir, "assets"));
    fs.writeFileSync(
      path.join(dir, "assets", "index.js"),
      'console.log("bundle");',
    );
    const port = await listen(createConnectServer({ dir }));

    const ok = await httpGet(`http://127.0.0.1:${port}/assets/index.js`);
    expect(ok.status).toBe(200);
    expect(ok.body).toBe('console.log("bundle");');
    expect(ok.headers["cache-control"]).toMatch(/max-age=31536000/);
    expect(ok.headers["cache-control"]).toMatch(/immutable/);

    const missing = await httpGet(`http://127.0.0.1:${port}/assets/missing.js`);
    expect(missing.status).toBe(404);
  });

  it("substitutes once at load and serves the cached document afterwards", async () => {
    const dir = makeAssetsDir(DYNAMIC_BASE_HTML);
    const port = await listen(createConnectServer({ dir, base: "/myagent/" }));

    const first = await httpGet(`http://127.0.0.1:${port}/`);
    // A disk change after the first serve is not re-read — the substituted
    // document is cached.
    fs.writeFileSync(
      path.join(dir, "index.html"),
      "<html><head></head><body>changed</body></html>",
    );
    const second = await httpGet(`http://127.0.0.1:${port}/`);
    expect(second.body).toBe(first.body);
  });
});
