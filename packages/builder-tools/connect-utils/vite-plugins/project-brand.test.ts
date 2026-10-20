import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  PHBackgroundLayers,
  PHConnectBranding,
} from "@powerhousedao/shared/clis";
import { describe, expect, it } from "vitest";
import {
  brandMetaTags,
  effectiveBranding,
  pngSize,
  replaceShellLoader,
  resolveBackground,
  resolveExplorerIcons,
  resolveProjectFavicons,
  resolveProjectLoader,
  resolveProjectPwaBrand,
  resolveRuntimeBranding,
  withProjectFavicons,
  withResolvedGenericImages,
} from "./project-brand.js";
import { brandManifest } from "./pwa.js";

/** A PNG header carrying width × height (enough for pngSize). */
function png(width: number, height: number): Buffer {
  const bytes = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(bytes);
  bytes.writeUInt32BE(13, 8);
  bytes.write("IHDR", 12, "ascii");
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes;
}

function project(files: Record<string, Buffer | string>): string {
  const dir = mkdtempSync(join(tmpdir(), "ph-brand-"));
  for (const [rel, content] of Object.entries(files)) {
    const file = join(dir, rel);
    mkdirSync(join(file, ".."), { recursive: true });
    writeFileSync(file, content);
  }
  return dir;
}

const dataUri = (buffer: Buffer) =>
  `data:image/png;base64,${buffer.toString("base64")}`;

describe("effectiveBranding", () => {
  it("fills the defaults and lets null in any layer mean the default", () => {
    expect(effectiveBranding()).toEqual({
      appName: "Powerhouse Connect",
      icon: null,
      loader: null,
    });
    // the scaffold's all-null block is the default look
    expect(
      effectiveBranding({ appName: null, icon: null, loader: null }),
    ).toEqual(effectiveBranding());
    // source sets, the override's null resets
    expect(
      effectiveBranding(
        { appName: "Pizza", loader: "./l.png", icon: "./a.png" },
        { loader: null, appName: "  " },
      ),
    ).toMatchObject({
      appName: "Powerhouse Connect",
      loader: null,
      icon: "./a.png",
    });
    // a key branding no longer has (the home background moved to
    // connect.home, the generic plugin's) is dropped, not carried along
    expect(
      effectiveBranding({ homeBackground: "./bg.webp" } as PHConnectBranding),
    ).toEqual(effectiveBranding());
  });
});

describe("resolveRuntimeBranding", () => {
  it("resolves the icon's 64 px variant to a data URI", () => {
    const dir = project({
      "icons/app.png": png(1024, 1024),
      "icons/app_64x64.png": png(64, 64),
    });
    const runtime = resolveRuntimeBranding(
      dir,
      effectiveBranding({
        appName: "Pizza Plaza",
        icon: "./icons/app.png",
        loader: "./icons/app.png",
      }),
    );
    expect(runtime.appName).toBe("Pizza Plaza");
    expect(runtime.icon).toBe(dataUri(png(64, 64)));
    // the loader is served as a file and declared in index.html
    expect(runtime.loader).toBeNull();
  });

  it("keeps nulls for the defaults and a master without variants as the logo", () => {
    const dir = project({ "icons/app.png": png(16, 16) });
    expect(resolveRuntimeBranding(dir, effectiveBranding())).toEqual({
      appName: "Powerhouse Connect",
      icon: null,
      loader: null,
    });
    expect(
      resolveRuntimeBranding(
        dir,
        effectiveBranding({ icon: "./icons/app.png" }),
      ).icon,
    ).toMatch(/^data:image\/png/);
  });
});

describe("resolveBackground", () => {
  const svg = (viewBox: boolean) =>
    `<svg xmlns="http://www.w3.org/2000/svg"${viewBox ? ' viewBox="0 0 10 10"' : ""}/>`;

  it("resolves every layer's light and dark image and keeps the layout", () => {
    const dir = project({
      "brand/lockup.svg": svg(true),
      "brand/lockup-dark.svg": svg(true),
      "brand/growth.png": png(10, 10),
    });
    const warnings: string[] = [];
    const resolved = resolveBackground(
      dir,
      {
        color: { light: "#fff", dark: "#000" },
        layers: [
          {
            src: {
              light: "./brand/lockup.svg",
              dark: "./brand/lockup-dark.svg",
            },
            position: { top: 32, left: 40 },
            width: 200,
          },
          {
            src: "./brand/growth.png",
            position: { bottom: 0, right: 0 },
            width: "min(55%, 880px)",
            fade: { top: 160, left: 160 },
          },
          { src: "./brand/none.png" },
          { src: "https://cdn.example/x.webp", opacity: 0.5 },
        ],
      },
      (message) => warnings.push(message),
    );
    const { color, layers } = resolved as PHBackgroundLayers;
    expect(color).toEqual({ light: "#fff", dark: "#000" });
    expect(layers).toHaveLength(3);
    const lockup = layers[0].src as { light: string; dark: string };
    expect(lockup.light).toMatch(/^data:image\/svg\+xml;base64,/);
    expect(lockup.dark).toMatch(/^data:image\/svg\+xml;base64,/);
    expect(layers[0]).toMatchObject({
      position: { top: 32, left: 40 },
      width: 200,
    });
    expect(layers.slice(1)).toEqual([
      {
        src: dataUri(png(10, 10)),
        position: { bottom: 0, right: 0 },
        width: "min(55%, 880px)",
        fade: { top: 160, left: 160 },
      },
      { src: "https://cdn.example/x.webp", opacity: 0.5 },
    ]);
    expect(warnings).toEqual([
      "[branding] file not found, skipped: ./brand/none.png",
    ]);
  });

  it("warns about an SVG without a viewBox and a layer pinned to both edges", () => {
    const dir = project({ "brand/mark.svg": svg(false) });
    const warnings: string[] = [];
    resolveBackground(
      dir,
      {
        layers: [{ src: "./brand/mark.svg", position: { top: 0, bottom: 0 } }],
      },
      (message) => warnings.push(message),
    );
    expect(warnings).toEqual([
      "[branding] homeBackground.layers[0].position: set top or bottom, not both",
      "[branding] ./brand/mark.svg has no viewBox, so its aspect is unknown: give the layer both width and height.",
    ]);
  });

  it("keeps a single image a single image, and nothing for nothing", () => {
    const dir = project({ "bg.webp": "RIFF" });
    expect(resolveBackground(dir, "./bg.webp")).toMatch(/^data:image\/webp/);
    expect(resolveBackground(dir, "./none.webp")).toBeNull();
    expect(resolveBackground(dir, null)).toBeNull();
  });
});

describe("explorer icons (the generic plugin's)", () => {
  it("resolves paths, passes URLs through, drops what has no image", () => {
    const dir = project({ "icons/doc.png": png(8, 8) });
    const warnings: string[] = [];
    expect(
      resolveExplorerIcons(
        dir,
        {
          document: "./icons/doc.png",
          documents: { "acme/order": "./icons/doc.png", "x/y": "./nope.png" },
          folder: "https://cdn/folder.png",
          localDrive: null,
        },
        (m) => warnings.push(m),
      ),
    ).toEqual({
      document: dataUri(png(8, 8)),
      documents: { "acme/order": dataUri(png(8, 8)) },
      folder: "https://cdn/folder.png",
    });
    expect(warnings).toHaveLength(1);
    expect(resolveExplorerIcons(dir, null)).toBeNull();
    expect(resolveExplorerIcons(dir, { folder: "./nope.png" })).toBeNull();
  });

  it("resolves them, and the home background, in the source block and in the generic entry's config", () => {
    const dir = project({ "f.png": png(4, 4) });
    const connect = {
      branding: { appName: "x" },
      drives: { allowAddDrive: true, icons: { folder: "./f.png" } },
      home: { background: "./f.png" },
      composition: [
        { module: "@powerhousedao/connect/plugins/workflows", config: {} },
        {
          module: "@powerhousedao/connect/plugins/generic",
          config: {
            allowAddDrive: false,
            icons: { document: "./f.png" },
            homeBackground: { layers: [{ src: "./f.png", width: 200 }] },
          },
        },
      ],
    };
    const out = withResolvedGenericImages(dir, connect);
    expect(out.drives).toEqual({
      allowAddDrive: true,
      icons: { folder: dataUri(png(4, 4)) },
    });
    expect(out.home).toEqual({ background: dataUri(png(4, 4)) });
    expect(out.composition[1].config).toEqual({
      allowAddDrive: false,
      icons: { document: dataUri(png(4, 4)) },
      homeBackground: { layers: [{ src: dataUri(png(4, 4)), width: 200 }] },
    });
    // other entries and the rest of the block are untouched
    expect(out.composition[0]).toBe(connect.composition[0]);
    expect(out.branding).toBe(connect.branding);
    // nothing to resolve: the same object comes back
    const plain = { drives: { allowAddDrive: true } };
    expect(withResolvedGenericImages(dir, plain)).toBe(plain);
    expect(withResolvedGenericImages(dir, undefined)).toBeUndefined();
  });
});

describe("resolveProjectLoader", () => {
  it("takes a path with a pulse, or an explicit animation and size", () => {
    const dir = project({ "icons/truck.png": png(256, 256) });
    expect(
      resolveProjectLoader(dir, { loader: "./icons/truck.png" }),
    ).toMatchObject({
      fileName: "ph-loader.png",
      contentType: "image/png",
      animation: "pulse",
      size: 96,
    });
    expect(
      resolveProjectLoader(dir, {
        loader: { src: "./icons/truck.png", animation: "none", size: 160 },
      }),
    ).toMatchObject({ animation: "none", size: 160 });
  });

  it("keeps Connect's logo when unset, null, missing or a URL", () => {
    const warnings: string[] = [];
    const warn = (m: string) => warnings.push(m);
    const dir = project({});
    expect(resolveProjectLoader(dir, {})).toBeUndefined();
    expect(resolveProjectLoader(dir, { loader: null })).toBeUndefined();
    expect(
      resolveProjectLoader(dir, { loader: "./nope.png" }, warn),
    ).toBeUndefined();
    expect(
      resolveProjectLoader(dir, { loader: "https://x/y.png" }, warn),
    ).toBeUndefined();
    expect(warnings).toHaveLength(2);
  });
});

describe("resolveProjectPwaBrand", () => {
  it("names the app and takes the sized PNGs next to the master", () => {
    const dir = project({
      "icons/app.png": png(1024, 1024),
      "icons/app_192x192.png": png(192, 192),
      "icons/app_512x512.png": png(512, 512),
    });
    const brand = resolveProjectPwaBrand(dir, {
      icon: "./icons/app.png",
      appName: "Pizza Plaza",
    });
    expect(brand.name).toBe("Pizza Plaza");
    expect(brand.icons?.map((i) => [i.fileName, i.sizes])).toEqual([
      ["pwa-app-192x192.png", "192x192"],
      ["pwa-app-512x512.png", "512x512"],
      ["pwa-app-1024x1024.png", "1024x1024"],
    ]);
  });

  it("changes nothing for the default branding", () => {
    expect(resolveProjectPwaBrand(project({}), effectiveBranding())).toEqual(
      {},
    );
    expect(resolveProjectPwaBrand(project({}), undefined)).toEqual({});
  });
});

describe("favicons", () => {
  it("takes the 16/32/64 siblings and replaces the icon.ico link", () => {
    const dir = project({
      "icons/app.png": png(1024, 1024),
      "icons/app_16x16.png": png(16, 16),
      "icons/app_32x32.png": png(32, 32),
    });
    const favicons = resolveProjectFavicons(dir, { icon: "./icons/app.png" });
    expect(favicons.map((f) => [f.fileName, f.sizes])).toEqual([
      ["favicon-16x16.png", "16x16"],
      ["favicon-32x32.png", "32x32"],
    ]);
    const html =
      '<html><head><link rel="icon" href="/icon.ico" /><title>x</title></head></html>';
    const out = withProjectFavicons(html, favicons, "/app/");
    expect(out).not.toContain("icon.ico");
    expect(out).toContain(
      '<link rel="icon" type="image/png" sizes="16x16" href="/app/favicon-16x16.png" />',
    );
    expect(out).toContain('sizes="32x32" href="/app/favicon-32x32.png"');
    expect(out.indexOf("<title>")).toBeLessThan(out.indexOf("favicon-16x16"));
  });

  it("a favicon named outright wins over the icon's siblings", () => {
    const dir = project({
      "icons/app.png": png(1024, 1024),
      "icons/app_16x16.png": png(16, 16),
      "icons/app.ico": "ico",
    });
    const icon = "./icons/app.png";
    expect(resolveProjectFavicons(dir, { icon })).toHaveLength(1);
    // branding.favicon or ph connect build --favicon
    expect(
      resolveProjectFavicons(dir, { icon }, undefined, "icons/app.ico"),
    ).toEqual([]);
  });

  it("an SVG master is one scalable favicon; no siblings keep Connect's", () => {
    const warnings: string[] = [];
    const dir = project({ "a.svg": "<svg/>", "b.png": png(2, 2) });
    expect(resolveProjectFavicons(dir, { icon: "./a.svg" })).toEqual([
      expect.objectContaining({ fileName: "favicon.svg", sizes: "any" }),
    ]);
    expect(
      resolveProjectFavicons(dir, { icon: "./b.png" }, (m) => warnings.push(m)),
    ).toEqual([]);
    expect(resolveProjectFavicons(dir, { icon: null })).toEqual([]);
    expect(warnings).toHaveLength(1);
    expect(withProjectFavicons("<head></head>", [])).toBe("<head></head>");
  });
});

describe("brandManifest", () => {
  const base = {
    name: "Powerhouse Connect",
    short_name: "Connect",
    description: "Connect's description",
    icons: [{ src: "pwa-192x192.png", sizes: "192x192", type: "image/png" }],
  };

  it("replaces Connect's name, description and icons", () => {
    const manifest = brandManifest(base, {
      name: "Pizza Plaza",
      icons: [
        {
          fileName: "pwa-app-512x512.png",
          file: "/x.png",
          contentType: "image/png",
          sizes: "512x512",
        },
      ],
    });
    expect(manifest).toMatchObject({
      name: "Pizza Plaza",
      short_name: "Pizza Plaza",
      icons: [
        { src: "pwa-app-512x512.png", sizes: "512x512", type: "image/png" },
      ],
    });
    expect(manifest.description).toBeUndefined();
  });

  it("keeps Connect's manifest without a brand", () => {
    expect(brandManifest(base, {})).toEqual(base);
    expect(brandManifest(base, undefined)).toBe(base);
  });
});

describe("the loader in index.html and the shell", () => {
  const loader = {
    fileName: "ph-loader.png",
    file: "/x.png",
    contentType: "image/png",
    animation: "spin" as const,
    size: 120,
  };

  it("declares the loader and a custom shell in meta tags", () => {
    const tags = brandMetaTags({ loader, customShell: true });
    expect(tags).toContain(
      '<meta name="ph-loader" content="ph-loader.png" data-animation="spin" data-size="120">',
    );
    expect(tags).toContain('<meta name="ph-custom-shell" content="true">');
    expect(brandMetaTags({})).toBe("");
  });

  it("swaps the shell's logo slot for the loader, under the base", () => {
    const body =
      '<div class="ph-shell-loader"><div data-ph-loader-slot="" class="animate-pulse"><svg><path d="M0"></path></svg></div></div>';
    const out = replaceShellLoader(body, loader, "/app/");
    expect(out).not.toContain("<svg>");
    expect(out).toContain('src="/app/ph-loader.png"');
    expect(out).toContain("animation:ph-loader-spin");
    expect(out.startsWith('<div class="ph-shell-loader">')).toBe(true);
    expect(out.endsWith("</div>")).toBe(true);
  });

  it("swaps core's spinner slot (no logo inside) for the loader too", () => {
    const body =
      '<div class="ph-shell-loader"><div data-ph-loader-slot="" class="size-5 animate-spin"></div></div>';
    const out = replaceShellLoader(body, loader);
    expect(out).not.toContain("size-5");
    expect(out).toContain('src="/ph-loader.png"');
    expect(out.match(/<\/div>/g)).toHaveLength(1);
  });
});

describe("pngSize", () => {
  it("reads the IHDR size and rejects other files", () => {
    expect(pngSize(png(300, 200))).toEqual([300, 200]);
    expect(pngSize(Buffer.from("not a png at all, no sir"))).toBeUndefined();
  });
});
