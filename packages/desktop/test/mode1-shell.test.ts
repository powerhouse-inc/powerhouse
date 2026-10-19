import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { HostDefinition, RunnerContext } from "@powerhousedao/host-core";
import { appJsonSchema, loadAppJson, appSlug } from "../src/app-json.js";
import { bundleStack } from "../src/bundle-stack.js";
import { projectShell } from "../src/shell-project.js";
import {
  nodeSidecarTarget,
  preflightOrThrow,
  tauriBundlesForHost,
} from "../src/shell-toolchain.js";
import {
  rebaseBackground,
  scaffoldDesktopShell,
  solidPng,
} from "../src/scaffold.js";
import { shellMode } from "../src/runner.js";

const temporary: string[] = [];
afterEach(() => {
  for (const dir of temporary.splice(0)) {
    rmSync(dir, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 100,
    });
  }
});
function tempDir(prefix: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), prefix));
  temporary.push(dir);
  return dir;
}

const validApp = {
  identifier: "com.acme.taco",
  productName: "Taco Tent",
  icon: "./icon.png",
  window: { title: "Taco Tent", width: 1200, height: 800 },
  fileAssociations: [{ ext: ["taco"], name: "Taco Doc" }],
};

describe("app.json schema", () => {
  it("accepts a valid identity and rejects a non-reverse-DNS identifier", () => {
    expect(appJsonSchema.safeParse(validApp).success).toBe(true);
    expect(
      appJsonSchema.safeParse({ ...validApp, identifier: "nodots" }).success,
    ).toBe(false);
  });

  it("rejects unknown keys and a leading dot in an extension", () => {
    expect(appJsonSchema.safeParse({ ...validApp, extra: 1 }).success).toBe(
      false,
    );
    expect(
      appJsonSchema.safeParse({
        ...validApp,
        fileAssociations: [{ ext: [".taco"], name: "x" }],
      }).success,
    ).toBe(false);
  });

  it("rejects shell.source with both path and git", () => {
    expect(
      appJsonSchema.safeParse({
        ...validApp,
        shell: { path: "../x", git: "https://y" },
      }).success,
    ).toBe(false);
  });

  it("loadAppJson throws a named error when the file is missing", () => {
    const dir = tempDir("ph-appjson-");
    expect(() => loadAppJson(dir)).toThrow(/app\.json/);
  });

  it("appSlug slugifies the product name", () => {
    expect(appSlug(validApp)).toBe("taco-tent");
    expect(appSlug({ ...validApp, productName: "My App!!" })).toBe("my-app");
  });
});

describe("shell projection", () => {
  function projectInto(appOver: Record<string, unknown> = {}, port = 6494) {
    const dir = tempDir("ph-proj-");
    writeFileSync(path.join(dir, "icon.png"), solidPng(16, [1, 2, 3, 255]));
    const app = appJsonSchema.parse({ ...validApp, ...appOver });
    const res = projectShell({ hostDir: dir, app, connectPort: port });
    const read = (rel: string) =>
      readFileSync(path.join(res.shellDir, rel), "utf8");
    return { dir, res, read };
  }

  it("emits the crate with the product slug as the bin name", () => {
    const { res, read } = projectInto();
    expect(res.binName).toBe("taco-tent");
    const cargo = read("Cargo.toml");
    expect(cargo).toContain('name = "taco-tent"');
    expect(cargo).toContain("ph-desktop-shell");
  });

  it("is idempotent — a second projection with the same input changes nothing", () => {
    const dir = tempDir("ph-proj-idem-");
    writeFileSync(path.join(dir, "icon.png"), solidPng(16, [1, 2, 3, 255]));
    const app = appJsonSchema.parse(validApp);
    expect(projectShell({ hostDir: dir, app, connectPort: 6494 }).changed).toBe(
      true,
    );
    expect(projectShell({ hostDir: dir, app, connectPort: 6494 }).changed).toBe(
      false,
    );
  });

  it("shows the full-resolution app icon on the loading page", () => {
    const dir = tempDir("ph-proj-logo-");
    const icon = solidPng(1024, [79, 70, 229, 255]);
    writeFileSync(path.join(dir, "icon.png"), icon);
    const app = appJsonSchema.parse(validApp);
    const res = projectShell({ hostDir: dir, app, connectPort: 6494 });
    const html = readFileSync(path.join(res.shellDir, "ui/index.html"), "utf8");
    expect(html).toContain('<img class="logo" src="./logo.png"');
    // the SOURCE bytes, not a downsampled tauri-icon output
    expect(
      readFileSync(path.join(res.shellDir, "ui/logo.png")).equals(icon),
    ).toBe(true);
    // generated, not tracked
    expect(
      readFileSync(path.join(res.shellDir, ".gitignore"), "utf8"),
    ).toContain("/ui/logo.png");
    // unchanged icon → nothing rewritten
    expect(projectShell({ hostDir: dir, app, connectPort: 6494 }).changed).toBe(
      false,
    );
    // a new icon → the logo follows
    const next = solidPng(1024, [1, 2, 3, 255]);
    writeFileSync(path.join(dir, "icon.png"), next);
    expect(projectShell({ hostDir: dir, app, connectPort: 6494 }).changed).toBe(
      true,
    );
    expect(
      readFileSync(path.join(res.shellDir, "ui/logo.png")).equals(next),
    ).toBe(true);
  });

  it("shows the app.json splash on the loading page instead of the logo", () => {
    const dir = tempDir("ph-proj-splash-");
    writeFileSync(path.join(dir, "icon.png"), solidPng(16, [1, 2, 3, 255]));
    const splash = solidPng(64, [9, 9, 9, 255]);
    mkdirSync(path.join(dir, "art"), { recursive: true });
    writeFileSync(path.join(dir, "art", "splash.png"), splash);
    const app = appJsonSchema.parse({
      ...validApp,
      splash: "./art/splash.png",
    });
    const res = projectShell({ hostDir: dir, app, connectPort: 6494 });
    const html = readFileSync(path.join(res.shellDir, "ui/index.html"), "utf8");
    expect(html).toContain('<img class="splash" src="./splash.png"');
    expect(html).not.toContain('class="logo"');
    expect(
      readFileSync(path.join(res.shellDir, "ui/splash.png")).equals(splash),
    ).toBe(true);
    expect(
      readFileSync(path.join(res.shellDir, ".gitignore"), "utf8"),
    ).toContain("/ui/splash.png");
    // a missing splash file falls back to the logo
    const fallback = projectShell({
      hostDir: dir,
      app: appJsonSchema.parse({ ...validApp, splash: "./art/none.png" }),
      connectPort: 6494,
    });
    expect(
      readFileSync(path.join(fallback.shellDir, "ui/index.html"), "utf8"),
    ).toContain('class="logo"');
  });

  it("themes the loading page and bounds the window from app.json", () => {
    const dir = tempDir("ph-proj-theme-");
    const app = appJsonSchema.parse({
      ...validApp,
      loading: {
        background: "#f7f1e8",
        color: "#2b2522",
        accent: "#c8392b",
        message: "Opening the <kitchen>…",
      },
      window: { minWidth: 1280, minHeight: 760 },
    });
    const res = projectShell({ hostDir: dir, app, connectPort: 6494 });
    const html = readFileSync(path.join(res.shellDir, "ui/index.html"), "utf8");
    expect(html).toContain("--bg: #f7f1e8; --fg: #2b2522; --accent: #c8392b;");
    expect(html).toContain("Opening the &lt;kitchen>…");
    expect(html).not.toContain("#0f1115");
    const conf = JSON.parse(
      readFileSync(path.join(res.shellDir, "tauri.conf.json"), "utf8"),
    ) as { app: { windows: Record<string, unknown>[] } };
    expect(conf.app.windows[0]).toMatchObject({
      minWidth: 1280,
      minHeight: 760,
    });
    // defaults stay the dark page, and only hex colors validate
    const plain = projectShell({
      hostDir: tempDir("ph-proj-theme-default-"),
      app: appJsonSchema.parse(validApp),
      connectPort: 6494,
    });
    expect(
      readFileSync(path.join(plain.shellDir, "ui/index.html"), "utf8"),
    ).toContain("--bg: #0f1115; --fg: #e6e8eb; --accent: #4ade80;");
    expect(
      appJsonSchema.safeParse({ ...validApp, loading: { background: "red" } })
        .success,
    ).toBe(false);
  });

  it("null branding fields (the scaffold's) mean the defaults", () => {
    const dir = tempDir("ph-proj-null-");
    writeFileSync(path.join(dir, "icon.png"), solidPng(16, [1, 2, 3, 255]));
    const app = appJsonSchema.parse({
      ...validApp,
      splash: null,
      splashDark: null,
      loading: { background: null, message: null, dark: null, art: null },
    });
    const res = projectShell({ hostDir: dir, app, connectPort: 6494 });
    const html = readFileSync(path.join(res.shellDir, "ui/index.html"), "utf8");
    expect(html).toContain("--bg: #0f1115; --fg: #e6e8eb; --accent: #4ade80;");
    expect(html).toContain('<img class="logo" src="./logo.png"');
    expect(html).toContain("Starting Taco Tent");
    expect(html).not.toContain("prefers-color-scheme: dark) {");
    expect(html).not.toContain('class="corner"');
    expect(
      appJsonSchema.safeParse({ ...validApp, loading: null }).success,
    ).toBe(true);
  });

  it("swaps splash, corner art and colors for the dark color scheme", () => {
    const dir = tempDir("ph-proj-dark-");
    writeFileSync(path.join(dir, "icon.png"), solidPng(16, [1, 2, 3, 255]));
    mkdirSync(path.join(dir, "art"), { recursive: true });
    const light = solidPng(64, [9, 9, 9, 255]);
    const dark = solidPng(64, [200, 200, 200, 255]);
    const svg = Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>");
    writeFileSync(path.join(dir, "art", "splash.png"), light);
    writeFileSync(path.join(dir, "art", "splash-dark.png"), dark);
    writeFileSync(path.join(dir, "art", "mark.svg"), svg);
    writeFileSync(path.join(dir, "art", "mark-dark.svg"), svg);
    const app = appJsonSchema.parse({
      ...validApp,
      splash: "./art/splash.png",
      splashDark: "./art/splash-dark.png",
      loading: {
        background: "#f7f1e8",
        dark: { background: "#121212", accent: "#ffcc00" },
        art: "./art/mark.svg",
        artDark: "./art/mark-dark.svg",
      },
    });
    const res = projectShell({ hostDir: dir, app, connectPort: 6494 });
    const html = readFileSync(path.join(res.shellDir, "ui/index.html"), "utf8");
    // dark overrides per field; an unset dark field keeps the light value
    expect(html).toContain("--bg: #f7f1e8; --fg: #e6e8eb; --accent: #4ade80;");
    expect(html).toMatch(
      /prefers-color-scheme: dark\) \{\s*:root \{\s*--bg: #121212;\s*--fg: #e6e8eb;\s*--accent: #ffcc00;/,
    );
    // <picture> swaps the splash and the corner art by scheme
    expect(html).toContain(
      '<source srcset="./splash-dark.png" media="(prefers-color-scheme: dark)" />',
    );
    expect(html).toContain('<img class="splash" src="./splash.png"');
    expect(html).toContain('<div class="corner" aria-hidden="true">');
    expect(html).toContain(
      '<source srcset="./art-dark.svg" media="(prefers-color-scheme: dark)" />',
    );
    expect(html).toContain('<img class="art" src="./art.svg"');
    // the files travel beside the page under their extension, out of git
    expect(
      readFileSync(path.join(res.shellDir, "ui/splash-dark.png")).equals(dark),
    ).toBe(true);
    expect(existsSync(path.join(res.shellDir, "ui/art.svg"))).toBe(true);
    expect(existsSync(path.join(res.shellDir, "ui/art-dark.svg"))).toBe(true);
    const ignore = readFileSync(path.join(res.shellDir, ".gitignore"), "utf8");
    expect(ignore).toContain("/ui/splash-dark.png");
    expect(ignore).toContain("/ui/art.*");
  });

  it("renders the loading page without a logo when the icon file is missing", () => {
    const dir = tempDir("ph-proj-nologo-");
    const app = appJsonSchema.parse(validApp);
    const res = projectShell({ hostDir: dir, app, connectPort: 6494 });
    const html = readFileSync(path.join(res.shellDir, "ui/index.html"), "utf8");
    expect(html).not.toContain("<img");
    expect(html).toContain("Starting Taco Tent");
    expect(existsSync(path.join(res.shellDir, "ui/logo.png"))).toBe(false);
  });

  it("reruns the build script when the icon set changes (no stale compiled icon)", () => {
    const { read } = projectInto();
    expect(read("build.rs")).toContain(
      'println!("cargo:rerun-if-changed=icons");',
    );
  });

  it("bakes the connect port into the remote capability", () => {
    const { read } = projectInto({}, 7777);
    const cap = JSON.parse(read("capabilities/connect.json")) as {
      remote: { urls: string[] };
    };
    expect(cap.remote.urls).toContain("http://127.0.0.1:7777");
  });

  it("projects identity, window and file associations into tauri.conf.json", () => {
    const { read } = projectInto();
    const conf = JSON.parse(read("tauri.conf.json")) as {
      identifier: string;
      productName: string;
      app: { windows: { width: number; height: number }[] };
      bundle: { fileAssociations: { ext: string[] }[]; targets: string[] };
    };
    expect(conf.identifier).toBe("com.acme.taco");
    expect(conf.productName).toBe("Taco Tent");
    expect(conf.app.windows[0]).toMatchObject({ width: 1200, height: 800 });
    expect(conf.bundle.fileAssociations[0].ext).toEqual(["taco"]);
    // cross-platform installer targets present
    expect(conf.bundle.targets).toEqual(
      expect.arrayContaining(["nsis", "app", "dmg"]),
    );
  });

  it("resolves the crate source: path, git, and crates.io default", () => {
    expect(
      projectInto({ shell: { path: "../crate" } }).read("Cargo.toml"),
    ).toContain('path = "../crate"');
    const git = projectInto({ shell: { git: "https://g/x", tag: "v2" } }).read(
      "Cargo.toml",
    );
    expect(git).toContain('git = "https://g/x"');
    expect(git).toContain('tag = "v2"');
    // omitted shell → crates.io version default
    expect(projectInto().read("Cargo.toml")).toMatch(
      /ph-desktop-shell = "0\.1"/,
    );
  });
});

describe("toolchain", () => {
  it("maps build hosts to node sidecar triples and rejects the unsupported", () => {
    expect(nodeSidecarTarget("win32", "x64").triple).toBe(
      "x86_64-pc-windows-msvc",
    );
    expect(nodeSidecarTarget("darwin", "arm64").triple).toBe(
      "aarch64-apple-darwin",
    );
    expect(() => nodeSidecarTarget("win32", "arm64")).toThrow(/mapping/);
  });

  it("chooses host-appropriate bundle targets", () => {
    expect(tauriBundlesForHost("darwin")).toEqual(["app", "dmg"]);
    expect(tauriBundlesForHost("win32")).toEqual(["nsis"]);
    expect(tauriBundlesForHost("linux")).toEqual(["deb", "appimage"]);
  });

  it("preflight fails with install guidance when the toolchain is incomplete", () => {
    expect(() =>
      preflightOrThrow({ cargo: false, tauri: null }, "desktop"),
    ).toThrow(/rustup\.rs[\s\S]*tauri-cli/);
    expect(() =>
      preflightOrThrow(
        {
          cargo: true,
          tauri: { cmd: "cargo", prefix: ["tauri"], via: "cargo-tauri" },
        },
        "desktop",
      ),
    ).not.toThrow();
  });
});

describe("background layers on the loading page", () => {
  const svg = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"/>',
  );

  it("places each layer by the shared style, swaps it by scheme, and drops the splash and corner art", () => {
    const dir = tempDir("ph-proj-layers-");
    writeFileSync(path.join(dir, "icon.png"), solidPng(16, [1, 2, 3, 255]));
    mkdirSync(path.join(dir, "brand"), { recursive: true });
    writeFileSync(path.join(dir, "brand", "lockup.svg"), svg);
    writeFileSync(path.join(dir, "brand", "lockup-dark.svg"), svg);
    const growth = solidPng(8, [7, 7, 7, 255]);
    writeFileSync(path.join(dir, "brand", "growth.png"), growth);
    const app = appJsonSchema.parse({
      ...validApp,
      // the deprecated fields are ignored once a background is set
      splash: "./brand/growth.png",
      loading: { background: "#ffffff", art: "./brand/growth.png" },
      background: {
        color: { light: "#f7f5f0", dark: "#14161a" },
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
            opacity: 0.9,
          },
          { src: "./brand/missing.svg" },
          { src: "https://cdn.example/x.webp", height: "40vh" },
        ],
      },
    });
    const res = projectShell({ hostDir: dir, app, connectPort: 6494 });
    const html = readFileSync(path.join(res.shellDir, "ui/index.html"), "utf8");
    // the background's colour wins over loading.background, per scheme
    expect(html).toContain("--bg: #f7f5f0; --fg: #e6e8eb; --accent: #4ade80;");
    expect(html).toMatch(
      /prefers-color-scheme: dark\) \{\s*:root \{\s*--bg: #14161a;/,
    );
    expect(html).toContain('<div class="layers" aria-hidden="true">');
    expect(html).toContain(
      '<source srcset="./bg-0-dark.svg" media="(prefers-color-scheme: dark)" />',
    );
    expect(html).toContain(
      '<img src="./bg-0.svg" alt="" style="position: absolute; pointer-events: none; object-fit: contain; top: 32px; left: 40px; width: 200px" />',
    );
    expect(html).toContain(
      '<img src="./bg-1.png" alt="" style="position: absolute; pointer-events: none; object-fit: contain; right: 0px; bottom: 0px; width: min(55%, 880px); opacity: 0.9; mask-image: linear-gradient(to bottom, transparent, #000 160px), linear-gradient(to right, transparent, #000 160px); mask-composite: intersect" />',
    );
    // a URL is used as given; a missing file drops its layer
    expect(html).toContain('<img src="https://cdn.example/x.webp" alt=""');
    expect(html).not.toContain("missing");
    expect(html).not.toContain('class="splash"');
    expect(html).not.toContain('class="corner"');
    expect(html).not.toContain('class="logo"');
    // staged beside the page, out of git
    expect(existsSync(path.join(res.shellDir, "ui/bg-0.svg"))).toBe(true);
    expect(existsSync(path.join(res.shellDir, "ui/bg-0-dark.svg"))).toBe(true);
    expect(
      readFileSync(path.join(res.shellDir, "ui/bg-1.png")).equals(growth),
    ).toBe(true);
    expect(
      readFileSync(path.join(res.shellDir, ".gitignore"), "utf8"),
    ).toContain("/ui/bg-*");
    // idempotent
    expect(projectShell({ hostDir: dir, app, connectPort: 6494 }).changed).toBe(
      false,
    );
  });

  it("a single image is one layer pinned bottom-right; the schema rejects a layer pinned to both edges", () => {
    const dir = tempDir("ph-proj-layer-one-");
    writeFileSync(path.join(dir, "art.svg"), svg);
    const app = appJsonSchema.parse({ ...validApp, background: "./art.svg" });
    const res = projectShell({ hostDir: dir, app, connectPort: 6494 });
    const html = readFileSync(path.join(res.shellDir, "ui/index.html"), "utf8");
    expect(html).toContain(
      '<img src="./bg-0.svg" alt="" style="position: absolute; pointer-events: none; object-fit: contain; right: 0px; bottom: 0px" />',
    );
    // no colour of its own: the loading colours stay
    expect(html).toContain("--bg: #0f1115;");
    const invalid = appJsonSchema.safeParse({
      ...validApp,
      background: {
        layers: [{ src: "./art.svg", position: { top: 0, bottom: 0 } }],
      },
    });
    expect(invalid.success).toBe(false);
    expect(JSON.stringify(invalid.error?.issues)).toContain(
      "set top or bottom, not both",
    );
    expect(
      appJsonSchema.safeParse({ ...validApp, background: null }).success,
    ).toBe(true);
  });
});

describe("scaffold", () => {
  it("writes the background it is given and rebases its paths to the host directory", () => {
    const root = tempDir("ph-scaffold-bg-");
    const host = path.join(root, "hosts", "desktop");
    const background = rebaseBackground(
      {
        color: "#fff",
        layers: [
          {
            src: { light: "./icons/l.svg", dark: "./icons/d.svg" },
            width: 200,
          },
          { src: "https://cdn.example/x.webp" },
        ],
      },
      root,
      host,
    );
    expect(background).toEqual({
      color: "#fff",
      layers: [
        {
          src: { light: "../../icons/l.svg", dark: "../../icons/d.svg" },
          width: 200,
        },
        { src: "https://cdn.example/x.webp" },
      ],
    });
    expect(rebaseBackground("./bg.webp", root, host)).toBe("../../bg.webp");
    scaffoldDesktopShell(host, {
      identifier: "com.acme.app",
      productName: "Acme App",
      background,
    });
    expect(loadAppJson(host).background).toEqual(background);
    // none given: listed as null, like the other defaults
    const plain = path.join(tempDir("ph-scaffold-nobg-"), "hosts", "desktop");
    scaffoldDesktopShell(plain, { identifier: "com.a.b", productName: "A" });
    expect(loadAppJson(plain).background).toBeNull();
  });

  it("writes a schema-valid app.json, a real PNG icon, and a .gitignore", () => {
    const host = path.join(tempDir("ph-scaffold-"), "hosts", "desktop");
    const res = scaffoldDesktopShell(host, {
      identifier: "com.acme.app",
      productName: "Acme App",
    });
    expect(res.created.some((f) => f.endsWith("app.json"))).toBe(true);
    const app = loadAppJson(host); // validates via the real loader
    expect(app.productName).toBe("Acme App");
    const png = readFileSync(path.join(host, "icon.png"));
    expect([...png.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });

  it("refuses to overwrite app.json without force", () => {
    const host = path.join(tempDir("ph-scaffold-force-"), "hosts", "desktop");
    scaffoldDesktopShell(host, { identifier: "com.a.b", productName: "A" });
    const second = scaffoldDesktopShell(host, {
      identifier: "com.a.b",
      productName: "A",
    });
    expect(second.skipped.some((f) => f.endsWith("app.json"))).toBe(true);
    expect(
      scaffoldDesktopShell(host, {
        identifier: "com.a.b",
        productName: "A",
        force: true,
      }).created.some((f) => f.endsWith("app.json")),
    ).toBe(true);
  });

  it("solidPng encodes the requested dimensions in the IHDR", () => {
    const png = solidPng(32, [0, 0, 0, 255]);
    // IHDR width is the 4 bytes at offset 16 (8 sig + 4 len + 4 type)
    expect(png.readUInt32BE(16)).toBe(32);
    expect(png.readUInt32BE(20)).toBe(32);
  });
});

describe("stack staging (mode 1 self-nesting)", () => {
  it("stages hosts/ into a shell that lives UNDER hosts/ without copying into itself", () => {
    const projectRoot = tempDir("ph-bundle-");
    writeFileSync(
      path.join(projectRoot, "package.json"),
      JSON.stringify({ name: "pizza" }),
    );
    writeFileSync(path.join(projectRoot, "powerhouse.config.json"), "{}");
    // a sibling host + the desktop host whose generated shell is the stage dir
    mkdirSync(path.join(projectRoot, "hosts", "connect"), { recursive: true });
    writeFileSync(
      path.join(projectRoot, "hosts", "connect", "host.js"),
      "export default {};",
    );
    const shellDir = path.join(projectRoot, "hosts", "desktop", "tauri-shell");
    mkdirSync(shellDir, { recursive: true });
    writeFileSync(
      path.join(projectRoot, "hosts", "desktop", "host.js"),
      'export default { runner: { module: "@powerhousedao/desktop/runner" } };',
    );
    writeFileSync(path.join(shellDir, "Cargo.toml"), "# crate");

    // Would throw ERR_FS_CP_EINVAL ("subdirectory of self") without the filter.
    const res = bundleStack({
      projectRoot,
      shellProjectDir: shellDir,
      vendor: false,
      excludeDirs: [shellDir],
      logger: () => {},
    });

    // the sibling host is staged; the shell subtree is NOT (kept out of self)
    expect(
      readFileSync(
        path.join(res.stackDir, "hosts", "connect", "host.js"),
        "utf8",
      ),
    ).toContain("export default");
    expect(
      existsSync(path.join(res.stackDir, "hosts", "desktop", "tauri-shell")),
    ).toBe(false);
    // the staged desktop host.js is rewritten to the generic compound
    expect(
      readFileSync(
        path.join(res.stackDir, "hosts", "desktop", "host.js"),
        "utf8",
      ),
    ).toContain("@powerhousedao/host-core/runners/compound");
  });
});

describe("shell source order (shellMode)", () => {
  const ctx = (env: Record<string, string> = {}): RunnerContext => ({
    projectRoot: projectRoot,
    verb: "dev",
    env,
  });
  let projectRoot = "";

  function host(over: Partial<HostDefinition> = {}): HostDefinition {
    return {
      name: "desktop",
      runner: { module: "@powerhousedao/desktop/runner" },
      ...over,
    } as HostDefinition;
  }

  it("prefers runner.shell.project over everything", () => {
    projectRoot = tempDir("ph-mode-proj-");
    const h = host({
      runner: { module: "m", shell: { project: "../s" } },
    } as Partial<HostDefinition>);
    expect(shellMode(h, ctx({ PH_DESKTOP_SHELL: "/x" }))).toBe(
      "external-project",
    );
  });

  it("falls to the generated shell when app.json is present", () => {
    projectRoot = tempDir("ph-mode-gen-");
    mkdirSync(path.join(projectRoot, "hosts", "desktop"), { recursive: true });
    writeFileSync(
      path.join(projectRoot, "hosts", "desktop", "app.json"),
      JSON.stringify(validApp),
    );
    expect(shellMode(host(), ctx())).toBe("generated");
  });

  it("uses PH_DESKTOP_SHELL only when no project and no app.json", () => {
    projectRoot = tempDir("ph-mode-env-");
    expect(shellMode(host(), ctx({ PH_DESKTOP_SHELL: "/x" }))).toBe(
      "external-env",
    );
    expect(shellMode(host(), ctx())).toBe("none");
  });
});
