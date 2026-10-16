import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  brandMetaTags,
  pngSize,
  replaceShellLoader,
  resolveProjectLoader,
  resolveProjectPwaBrand,
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

  it("keeps Connect's logo when unset, missing or a URL", () => {
    const warnings: string[] = [];
    const warn = (m: string) => warnings.push(m);
    const dir = project({});
    expect(resolveProjectLoader(dir, {})).toBeUndefined();
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
      icons: { app: "./icons/app.png" },
      connect: { branding: { appName: "Pizza Plaza" } },
    });
    expect(brand.name).toBe("Pizza Plaza");
    expect(brand.icons?.map((i) => [i.fileName, i.sizes])).toEqual([
      ["pwa-app-192x192.png", "192x192"],
      ["pwa-app-512x512.png", "512x512"],
      ["pwa-app-1024x1024.png", "1024x1024"],
    ]);
  });

  it("changes nothing without branding", () => {
    expect(resolveProjectPwaBrand(project({}), {})).toEqual({});
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
