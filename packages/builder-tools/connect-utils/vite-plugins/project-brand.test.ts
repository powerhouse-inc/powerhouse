import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  brandMetaTags,
  effectiveBranding,
  pngSize,
  replaceShellLoader,
  resolveProjectFavicons,
  resolveProjectLoader,
  resolveProjectPwaBrand,
  resolveRuntimeBranding,
  withProjectFavicons,
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

describe("effectiveBranding", () => {
  it("fills the defaults and lets null in any layer mean the default", () => {
    expect(effectiveBranding()).toEqual({
      appName: "Powerhouse Connect",
      homeBackground: null,
      icon: null,
      loader: null,
      icons: null,
    });
    // the scaffold's all-null block is the default look
    expect(
      effectiveBranding({
        appName: null,
        homeBackground: null,
        icon: null,
        loader: null,
        icons: null,
      }),
    ).toEqual(effectiveBranding());
    // source sets, the override's null resets (`--home-background ""`)
    expect(
      effectiveBranding(
        { appName: "Pizza", homeBackground: "./bg.webp", icon: "./a.png" },
        { homeBackground: null, appName: "  " },
      ),
    ).toMatchObject({
      appName: "Powerhouse Connect",
      homeBackground: null,
      icon: "./a.png",
    });
  });

  it("merges icons per key, a null key dropping back to the built-in icon", () => {
    const merged = effectiveBranding(
      { icons: { folder: "./f.png", document: "./d.png" } },
      { icons: { document: null, localDrive: "./l.png" } },
    );
    expect(merged.icons).toEqual({ folder: "./f.png", localDrive: "./l.png" });
    expect(
      effectiveBranding({ icons: { folder: "./f.png" } }, { icons: null })
        .icons,
    ).toBeNull();
  });
});

describe("resolveRuntimeBranding", () => {
  it("resolves every image to a data URI, the icon to its 64 px variant", () => {
    const dir = project({
      "icons/app.png": png(1024, 1024),
      "icons/app_64x64.png": png(64, 64),
      "icons/bg.webp": "RIFF",
      "icons/doc.png": png(8, 8),
    });
    const runtime = resolveRuntimeBranding(
      dir,
      effectiveBranding({
        appName: "Pizza Plaza",
        icon: "./icons/app.png",
        homeBackground: "./icons/bg.webp",
        loader: "./icons/app.png",
        icons: {
          document: "./icons/doc.png",
          documents: { "acme/order": "./icons/doc.png", "x/y": "./nope.png" },
          folder: "https://cdn/folder.png",
        },
      }),
    );
    expect(runtime.appName).toBe("Pizza Plaza");
    expect(runtime.icon).toBe(
      `data:image/png;base64,${png(64, 64).toString("base64")}`,
    );
    expect(runtime.homeBackground).toMatch(/^data:image\/webp;base64,/);
    // the loader is served as a file and declared in index.html
    expect(runtime.loader).toBeNull();
    expect(runtime.icons).toEqual({
      document: expect.stringMatching(/^data:image\/png/) as string,
      documents: { "acme/order": expect.stringMatching(/^data:/) as string },
      folder: "https://cdn/folder.png",
    });
  });

  it("keeps nulls for the defaults and a master without variants as the logo", () => {
    const dir = project({ "icons/app.png": png(16, 16) });
    const runtime = resolveRuntimeBranding(dir, effectiveBranding());
    expect(runtime).toEqual({
      appName: "Powerhouse Connect",
      homeBackground: null,
      icon: null,
      loader: null,
      icons: null,
    });
    expect(
      resolveRuntimeBranding(
        dir,
        effectiveBranding({ icon: "./icons/app.png" }),
      ).icon,
    ).toMatch(/^data:image\/png/);
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
});

describe("pngSize", () => {
  it("reads the IHDR size and rejects other files", () => {
    expect(pngSize(png(300, 200))).toEqual([300, 200]);
    expect(pngSize(Buffer.from("not a png at all, no sir"))).toBeUndefined();
  });
});
