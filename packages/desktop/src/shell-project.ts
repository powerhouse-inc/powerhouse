import fs from "node:fs";
import path from "node:path";
import {
  appSlug,
  DEFAULT_SHELL_CRATE_VERSION,
  type AppJson,
  type AppJsonShellSource,
} from "./app-json.js";

/**
 * P7.3 — project `hosts/desktop/app.json` into a generated `tauri-shell/`:
 * a STANDALONE tauri crate that depends on the published `ph-desktop-shell`
 * library, carries the builder's identity, and is built/run by the desktop
 * runner's dev/build verbs. The builder never writes Rust.
 *
 * Everything here mirrors the known-good reference app
 * (ph-desktop-shell/apps/powerhouse-desktop): the tauri plumbing (main.rs,
 * build.rs, capabilities, the loading page, externalBin + icon mechanics) is
 * copied verbatim; only identity/port fields are projected from app.json. The
 * projection is idempotent and stale-detected — a file is rewritten only when
 * its content changes, so Cargo.lock, the generated icon set, and tauri-build
 * output are never disturbed by a regen with an unchanged app.json.
 */

export const SHELL_DIR = "tauri-shell";
/** The icon source the runner feeds to `tauri icon` (copied from app.icon). */
export const ICON_SOURCE = "app-icon.png";

export interface ProjectShellInput {
  /** hosts/<host>/ — where app.json lives and tauri-shell/ is written. */
  hostDir: string;
  app: AppJson;
  /** The connect member's port — baked into the remote capability so the
   * served Connect origin can reach the shell's launch-queue commands. */
  connectPort: number;
}

export interface ProjectShellResult {
  shellDir: string;
  /** The crate/bin name (and the built exe stem the runner looks for). */
  binName: string;
  /** True when any projected file was created or changed this call. */
  changed: boolean;
}

/** `ph-desktop-shell` dependency line for the generated Cargo.toml, from
 * app.json's shell.source (path > git > crates.io version). */
function shellDependency(source: AppJsonShellSource | undefined): string {
  if (source?.path) {
    // Forward slashes work in Cargo.toml on every platform.
    const p = source.path.replace(/\\/g, "/");
    return `ph-desktop-shell = { path = ${JSON.stringify(p)} }`;
  }
  if (source?.git) {
    const parts = [`git = ${JSON.stringify(source.git)}`];
    if (source.tag) parts.push(`tag = ${JSON.stringify(source.tag)}`);
    if (source.rev) parts.push(`rev = ${JSON.stringify(source.rev)}`);
    return `ph-desktop-shell = { ${parts.join(", ")} }`;
  }
  const version = source?.version ?? DEFAULT_SHELL_CRATE_VERSION;
  return `ph-desktop-shell = ${JSON.stringify(version)}`;
}

function cargoToml(app: AppJson, binName: string): string {
  return `# GENERATED from ../app.json by @powerhousedao/desktop — do not edit by
# hand; edit app.json and re-run \`ph run desktop dev|build\`. Cargo.lock is
# preserved across regens.
[package]
name = ${JSON.stringify(binName)}
version = "0.1.0"
edition = "2021"

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
tauri = { version = "2", features = ["tray-icon", "devtools"] }
# Plugins must be DIRECT deps of the app crate: tauri-build only sees
# permission manifests (shell:allow-spawn etc.) from direct dependencies.
tauri-plugin-shell = "2"
tauri-plugin-single-instance = "2"
${shellDependency(app.shell)}

[[bin]]
name = ${JSON.stringify(binName)}
path = "src/main.rs"

[profile.release]
codegen-units = 1
lto = true
`;
}

const MAIN_RS = `// GENERATED — identity bakes from tauri.conf.json via generate_context!;
// behavior is the shared ph-desktop-shell library. Edit ../app.json, not this.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    ph_desktop_shell::run(tauri::generate_context!(), Default::default());
}
`;

const BUILD_RS = `// GENERATED — mirrors the reference shell. Connect is served over
// http://127.0.0.1 (a remote origin to Tauri), so the launch-queue commands
// need an explicit ACL; declaring the command manifest here generates the
// allow-<command> permissions that capabilities/*.json grant.
fn main() {
    // The icon set is a COMPILE-TIME input (the Windows resource icon here,
    // and the tray/window icon tauri::generate_context! embeds), but
    // tauri-build registers no rerun trigger for it: without this line a
    // regenerated icon set leaves the old icon compiled into the binary.
    println!("cargo:rerun-if-changed=icons");
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "take_launch_files",
            "read_launch_file",
            "log_from_webview",
        ]),
    ))
    .expect("failed to run tauri-build");
}
`;

/** The loading page's logo: app.json's icon SOURCE (1024² recommended), copied
 * beside ui/index.html — not one of the downsampled `tauri icon` outputs, so
 * it stays sharp on HiDPI screens. Generated, like the rest of ui/. */
export const LOADING_LOGO = "logo.png";

/** The loading page's splash (app.json `splash`), copied beside it; shown
 * instead of the square logo when set. Generated, like the rest of ui/. */
export const LOADING_SPLASH = "splash.png";
/** Dark-scheme splash (app.json `splashDark`), beside the light one. */
export const LOADING_SPLASH_DARK = "splash-dark.png";
/** Corner decoration (app.json `loading.art` / `loading.artDark`). */
export const LOADING_ART = "art";

/** CSS size of the logo; the 1024² source keeps it crisp up to 8x DPR. */
const LOGO_CSS_PX = 128;

/** The art the loading page shows: the wide splash (with an optional dark
 * counterpart), else the square logo; plus an optional corner decoration. */
type LoadingArt = {
  main: { kind: "logo" | "splash"; file: string; dark?: string } | null;
  corner: { file: string; dark?: string } | null;
};

function loadingHtml(app: AppJson, art: LoadingArt): string {
  const escape = (text: string) =>
    text.replace(/[<&]/g, (c) => (c === "<" ? "&lt;" : "&amp;"));
  const name = escape(app.productName);
  const loading = app.loading;
  const message = loading?.message
    ? escape(loading.message)
    : `Starting ${name}…`;
  const background = loading?.background ?? "#0f1115";
  const color = loading?.color ?? "#e6e8eb";
  const accent = loading?.accent ?? "#4ade80";
  const dark = loading?.dark;
  const darkVars = dark
    ? `
      @media (prefers-color-scheme: dark) {
        :root {
          --bg: ${dark.background ?? background};
          --fg: ${dark.color ?? color};
          --accent: ${dark.accent ?? accent};
        }
      }`
    : "";
  // <picture> swaps the file by color scheme; a plain <img> otherwise.
  const picture = (
    cls: string,
    file: string,
    darkFile: string | undefined,
    attrs = "",
  ) =>
    darkFile
      ? `<picture>
        <source srcset="./${darkFile}" media="(prefers-color-scheme: dark)" />
        <img class="${cls}" src="./${file}" alt=""${attrs} />
      </picture>
      `
      : `<img class="${cls}" src="./${file}" alt=""${attrs} />
      `;
  const main = art.main;
  const logoTag =
    main?.kind === "splash"
      ? picture("splash", main.file, main.dark)
      : main
        ? picture(
            "logo",
            main.file,
            main.dark,
            ` width="${LOGO_CSS_PX}" height="${LOGO_CSS_PX}"`,
          )
        : "";
  const cornerTag = art.corner
    ? `<div class="corner" aria-hidden="true">${picture("art", art.corner.file, art.corner.dark)}</div>
    `
    : "";
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${name}</title>
    <style>
      :root {
        color-scheme: light dark;
        --bg: ${background}; --fg: ${color}; --accent: ${accent};
      }${darkVars}
      body {
        margin: 0; height: 100vh; overflow: hidden;
        display: flex; align-items: center; justify-content: center;
        font: 15px/1.5 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
        background: var(--bg); color: var(--fg);
      }
      .box {
        position: relative; z-index: 1;
        text-align: center;
        display: flex; flex-direction: column; align-items: center; gap: 20px;
      }
      .logo {
        width: ${LOGO_CSS_PX}px; height: ${LOGO_CSS_PX}px;
        object-fit: contain; display: block;
      }
      .splash {
        width: min(720px, 80vw); max-height: 65vh;
        object-fit: contain; display: block;
      }
      .corner {
        position: fixed; right: 0; bottom: 0; z-index: 0;
        width: clamp(220px, 30vw, 520px); line-height: 0; pointer-events: none;
      }
      .art { width: 100%; height: auto; display: block; }
      .dot {
        width: 10px; height: 10px; border-radius: 50%;
        background: var(--accent); display: inline-block; margin-right: 8px;
        animation: pulse 1.2s ease-in-out infinite;
      }
      @keyframes pulse { 0%,100% { opacity: .35 } 50% { opacity: 1 } }
      @media (prefers-reduced-motion: reduce) { .dot { animation: none; } }
    </style>
  </head>
  <body>
    <div class="box">
      ${logoTag}<div><span class="dot"></span>${message}</div>
    </div>
    ${cornerTag}</body>
</html>
`;
}

function tauriConf(input: ProjectShellInput): string {
  const { app } = input;
  const win = app.window ?? {};
  const fileAssociations =
    app.fileAssociations && app.fileAssociations.length > 0
      ? app.fileAssociations.map((fa) => ({
          ext: fa.ext,
          name: fa.name,
          ...(fa.description ? { description: fa.description } : {}),
          ...(fa.mimeType ? { mimeType: fa.mimeType } : {}),
        }))
      : undefined;
  const conf = {
    $schema: "https://schema.tauri.app/config/2",
    productName: app.productName,
    version: "0.1.0",
    identifier: app.identifier,
    build: { frontendDist: "./ui" },
    app: {
      windows: [
        {
          title: win.title ?? app.productName,
          width: win.width ?? 1440,
          height: win.height ?? 900,
          resizable: win.resizable ?? true,
          ...(win.minWidth ? { minWidth: win.minWidth } : {}),
          ...(win.minHeight ? { minHeight: win.minHeight } : {}),
          visible: true,
          dragDropEnabled: false,
          create: false,
        },
      ],
      security: { csp: null },
    },
    bundle: {
      active: true,
      // Cross-platform: nsis (Windows, no WiX), app+dmg (macOS). The runner
      // passes host-appropriate --bundles at build time; tauri skips targets
      // not valid for the build host.
      targets: ["nsis", "app", "dmg"],
      // `tauri icon` generates .ico (Windows) and .icns (macOS) + pngs from
      // the single app-icon.png; the config references the per-platform set.
      icon: [
        "icons/32x32.png",
        "icons/128x128.png",
        "icons/128x128@2x.png",
        "icons/icon.icns",
        "icons/icon.ico",
      ],
      ...(fileAssociations ? { fileAssociations } : {}),
      externalBin: ["binaries/node"],
      resources: { "./dist-stack": "stack" },
    },
  };
  return JSON.stringify(conf, null, 2) + "\n";
}

function defaultCapability(): string {
  return (
    JSON.stringify(
      {
        $schema: "../gen/schemas/desktop-schema.json",
        identifier: "default",
        description: "Lets the shell spawn the bundled node sidecar.",
        windows: ["main"],
        permissions: [
          "core:default",
          "allow-take-launch-files",
          "allow-read-launch-file",
          "allow-log-from-webview",
          {
            identifier: "shell:allow-spawn",
            allow: [{ name: "binaries/node", sidecar: true, args: true }],
          },
          {
            identifier: "shell:allow-execute",
            allow: [{ name: "binaries/node", sidecar: true, args: true }],
          },
        ],
      },
      null,
      2,
    ) + "\n"
  );
}

function connectCapability(connectPort: number): string {
  const origin = `http://127.0.0.1:${connectPort}`;
  return (
    JSON.stringify(
      {
        $schema: "../gen/schemas/desktop-schema.json",
        identifier: "connect",
        description:
          "Connect is served over http://127.0.0.1 (a remote origin to Tauri); without this the launch-queue commands are rejected before they run.",
        windows: ["main"],
        remote: { urls: [origin, `${origin}/*`] },
        permissions: [
          "allow-take-launch-files",
          "allow-read-launch-file",
          "allow-log-from-webview",
        ],
      },
      null,
      2,
    ) + "\n"
  );
}

const GITIGNORE = `# Generated tauri shell — only Cargo.lock and app-icon.png are tracked.
/target
/gen
/icons
/ui/logo.png
/ui/splash.png
/ui/splash-dark.png
/ui/art.*
/ui/art-dark.*
/dist-stack
/binaries
`;

const DIST_STACK_README = `This directory is replaced at \`ph run desktop build\` with the shippable
stack (hosts + powerhouse.config.json + built Connect + vendored ph-cli). It
is bundled as the app's \`stack\` resource so the installed app runs with no
environment. Kept as a placeholder so tauri's resource glob resolves in dev.
`;

/** Write a file only when its content differs; returns whether it changed. */
function writeIfChanged(file: string, content: string): boolean {
  if (fs.existsSync(file) && fs.readFileSync(file, "utf8") === content) {
    return false;
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return true;
}

/**
 * Materialize/refresh `<hostDir>/tauri-shell/` from app.json. Idempotent:
 * unchanged app.json rewrites nothing. Does NOT run `tauri icon` or fetch the
 * node binary — those are toolchain steps the runner performs at dev/build.
 */
export function projectShell(input: ProjectShellInput): ProjectShellResult {
  const { hostDir, app, connectPort } = input;
  const binName = appSlug(app);
  const shellDir = path.join(hostDir, SHELL_DIR);
  const iconSrc = path.resolve(hostDir, app.icon);
  const iconBytes = fs.existsSync(iconSrc) ? fs.readFileSync(iconSrc) : null;
  const readRel = (rel: string | null | undefined): Buffer | null => {
    if (!rel) return null;
    const abs = path.resolve(hostDir, rel);
    return fs.existsSync(abs) ? fs.readFileSync(abs) : null;
  };
  const splashBytes = readRel(app.splash);
  const splashDarkBytes = readRel(app.splashDark);
  const artBytes = readRel(app.loading?.art);
  const artDarkBytes = readRel(app.loading?.artDark);
  const artExt = (rel: string | null | undefined) =>
    rel ? path.extname(rel).toLowerCase() || ".png" : ".png";
  const artFile = `${LOADING_ART}${artExt(app.loading?.art)}`;
  const artDarkFile = `${LOADING_ART}-dark${artExt(app.loading?.artDark)}`;
  const art: LoadingArt = {
    main: splashBytes
      ? {
          kind: "splash",
          file: LOADING_SPLASH,
          ...(splashDarkBytes ? { dark: LOADING_SPLASH_DARK } : {}),
        }
      : iconBytes
        ? { kind: "logo", file: LOADING_LOGO }
        : null,
    corner: artBytes
      ? { file: artFile, ...(artDarkBytes ? { dark: artDarkFile } : {}) }
      : null,
  };
  const files: Array<[string, string]> = [
    ["Cargo.toml", cargoToml(app, binName)],
    ["src/main.rs", MAIN_RS],
    ["build.rs", BUILD_RS],
    ["tauri.conf.json", tauriConf(input)],
    ["ui/index.html", loadingHtml(app, art)],
    ["capabilities/default.json", defaultCapability()],
    ["capabilities/connect.json", connectCapability(connectPort)],
    [".gitignore", GITIGNORE],
    ["dist-stack/README.md", DIST_STACK_README],
  ];
  let changed = false;
  for (const [rel, content] of files) {
    if (writeIfChanged(path.join(shellDir, rel), content)) changed = true;
  }
  // Stage the icon source next to the shell (tauri icon reads it at build),
  // the same full-resolution source as the loading page's logo, and the
  // splash when app.json names one.
  const copies: Array<[string, Buffer | null]> = [
    [path.join(shellDir, ICON_SOURCE), iconBytes],
    [path.join(shellDir, "ui", LOADING_LOGO), iconBytes],
    [path.join(shellDir, "ui", LOADING_SPLASH), splashBytes],
    [path.join(shellDir, "ui", LOADING_SPLASH_DARK), splashDarkBytes],
    [path.join(shellDir, "ui", artFile), artBytes],
    [path.join(shellDir, "ui", artDarkFile), artDarkBytes],
  ];
  for (const [dest, bytes] of copies) {
    if (!bytes) continue;
    if (!fs.existsSync(dest) || !fs.readFileSync(dest).equals(bytes)) {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, bytes);
      changed = true;
    }
  }
  return { shellDir, binName, changed };
}
