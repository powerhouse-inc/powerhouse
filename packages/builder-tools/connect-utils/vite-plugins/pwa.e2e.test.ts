import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { build } from "vite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  FILE_HANDLER_ACTION,
  type ConnectPwaFileHandler,
} from "./pwa-overrides.js";
import { connectPwaPlugins } from "./pwa.js";

// The temp project must live INSIDE cwd: Vite 8's build-html plugin rejects an
// index.html whose path resolves outside the working directory (it emits a
// "../.." fileName that rolldown refuses), so os.tmpdir() can't be used here.
// node_modules keeps the scratch dir git-ignored while still under cwd.
const TMP_PARENT = join(process.cwd(), "node_modules");

// Real Vite build (no full Connect app) that proves merged PWA overrides land
// in the emitted web manifest and generated service worker.
describe("connectPwaPlugins e2e build", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(TMP_PARENT, ".pwa-e2e-"));
    writeFileSync(
      join(root, "index.html"),
      `<!doctype html><html><head></head><body><script type="module" src="/main.js"></script></body></html>`,
    );
    writeFileSync(join(root, "main.js"), `console.log("hello");`);
    writeFileSync(join(root, "pwa-192x192.png"), "fakepng");
    writeFileSync(join(root, "pwa-512x512.png"), "fakepng");
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it("writes overridden manifest fields + the extra caching rule into dist", async () => {
    const outDir = join(root, "dist");
    await build({
      root,
      logLevel: "silent",
      build: { outDir, emptyOutDir: true },
      plugins: [
        ...connectPwaPlugins({
          offlineEnabled: true,
          pwa: {
            manifest: { theme_color: "#123456", name: "E2E Connect" },
            maximumFileSizeToCacheInBytes: 32 * 1024 * 1024,
            runtimeCaching: [
              {
                urlPattern: { source: "^https://api\\.acme\\.io/", flags: "i" },
                handler: "NetworkFirst",
                options: { cacheName: "acme-api" },
              },
            ],
          },
        }),
      ],
    });

    const files = readdirSync(outDir);
    const manifestFile = files.find((f) => f.endsWith(".webmanifest"));
    expect(manifestFile, "a .webmanifest should be emitted").toBeDefined();
    const manifest = JSON.parse(
      readFileSync(join(outDir, manifestFile as string), "utf-8"),
    ) as {
      theme_color?: string;
      name?: string;
      icons?: { src?: string; purpose?: string }[];
      file_handlers?: ConnectPwaFileHandler[];
      launch_handler?: { client_mode?: string };
    };
    expect(manifest.theme_color).toBe("#123456"); // override applied
    expect(manifest.name).toBe("E2E Connect");
    expect(manifest.icons?.length).toBeGreaterThanOrEqual(2); // base icons kept

    // The built-in file association ships by default: .phd/.phdm under the
    // vendor MIME keys, opening at the app root, with OS file-type icons
    // (the Powerhouse document icon, distinct from the app icon).
    expect(manifest.file_handlers).toHaveLength(1);
    const handler = manifest.file_handlers?.[0];
    expect(handler?.action).toBe(FILE_HANDLER_ACTION);
    expect(handler?.accept).toEqual({
      "application/vnd.powerhouse.document+zip": [".phd"],
      "application/vnd.powerhouse.document-model+zip": [".phdm"],
    });
    expect(handler?.icons?.map((icon) => icon.src)).toEqual([
      "document-icon-192x192.png",
      "document-icon-512x512.png",
    ]);
    expect(manifest.launch_handler?.client_mode).toBe("focus-existing");

    // The maskable icon is the full-bleed variant, not the rounded "any" one.
    const maskable = manifest.icons?.find(
      (icon) => icon.purpose === "maskable",
    );
    expect(maskable?.src).toBe("pwa-512x512-maskable.png");

    // The icon assets themselves are emitted into the build.
    for (const asset of [
      "pwa-192x192.png",
      "pwa-512x512.png",
      "pwa-512x512-maskable.png",
      "document-icon-192x192.png",
      "document-icon-512x512.png",
    ]) {
      expect(files, `${asset} should be emitted`).toContain(asset);
    }

    expect(files).toContain("service-worker.js");
    const sw = readFileSync(join(outDir, "service-worker.js"), "utf-8");
    // generateSW inlines the runtime-caching registrations into the worker.
    expect(sw).toContain("acme-api");
    // The built-in ph-runtime-config NetworkFirst rule carries its timeout.
    expect(sw).toContain("networkTimeoutSeconds");
  }, 60000);

  it("appends a contributed file handler after the built-in one", async () => {
    const outDir = join(root, "dist");
    await build({
      root,
      logLevel: "silent",
      build: { outDir, emptyOutDir: true },
      plugins: [
        ...connectPwaPlugins({
          offlineEnabled: true,
          pwa: {
            manifest: {
              file_handlers: [
                { accept: { "application/x-custom+zip": [".custom"] } },
              ],
            },
          },
        }),
      ],
    });
    const files = readdirSync(outDir);
    const manifestFile = files.find((f) => f.endsWith(".webmanifest"));
    const manifest = JSON.parse(
      readFileSync(join(outDir, manifestFile as string), "utf-8"),
    ) as { file_handlers?: ConnectPwaFileHandler[] };
    expect(manifest.file_handlers).toHaveLength(2);
    // Base first — Chromium is first-registered-wins per extension, so the
    // built-in .phd/.phdm association cannot be hijacked by a contribution.
    expect(manifest.file_handlers?.[0].accept).toHaveProperty(
      "application/vnd.powerhouse.document+zip",
    );
    expect(manifest.file_handlers?.[1]).toEqual({
      action: FILE_HANDLER_ACTION,
      accept: { "application/x-custom+zip": [".custom"] },
    });
  }, 60000);

  it("emits a self-destroying worker when offline is disabled", async () => {
    const outDir = join(root, "dist");
    await build({
      root,
      logLevel: "silent",
      build: { outDir, emptyOutDir: true },
      plugins: [...connectPwaPlugins({ offlineEnabled: false })],
    });
    const files = readdirSync(outDir);
    expect(files).toContain("service-worker.js");
    const sw = readFileSync(join(outDir, "service-worker.js"), "utf-8");
    // The self-destroying worker unregisters itself; it must not precache.
    expect(sw.toLowerCase()).toContain("unregister");
  }, 60000);
});
