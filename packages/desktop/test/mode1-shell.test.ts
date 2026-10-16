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
import { scaffoldDesktopShell, solidPng } from "../src/scaffold.js";
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

  it("renders the loading page without a logo when the icon file is missing", () => {
    const dir = tempDir("ph-proj-nologo-");
    const app = appJsonSchema.parse(validApp);
    const res = projectShell({ hostDir: dir, app, connectPort: 6494 });
    const html = readFileSync(path.join(res.shellDir, "ui/index.html"), "utf8");
    expect(html).not.toContain("<img");
    expect(html).toContain("Starting Taco Tent");
    expect(existsSync(path.join(res.shellDir, "ui/logo.png"))).toBe(false);
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

describe("scaffold", () => {
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
