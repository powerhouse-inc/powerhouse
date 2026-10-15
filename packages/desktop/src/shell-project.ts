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

function loadingHtml(productName: string): string {
  const name = productName.replace(/[<&]/g, (c) =>
    c === "<" ? "&lt;" : "&amp;",
  );
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${name}</title>
    <style>
      :root { color-scheme: light dark; }
      body {
        margin: 0; height: 100vh;
        display: flex; align-items: center; justify-content: center;
        font: 15px/1.5 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
        background: #0f1115; color: #e6e8eb;
      }
      .box { text-align: center; }
      .dot {
        width: 10px; height: 10px; border-radius: 50%;
        background: #4ade80; display: inline-block; margin-right: 8px;
        animation: pulse 1.2s ease-in-out infinite;
      }
      @keyframes pulse { 0%,100% { opacity: .35 } 50% { opacity: 1 } }
    </style>
  </head>
  <body>
    <div class="box"><span class="dot"></span>Starting ${name}…</div>
  </body>
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
  const files: Array<[string, string]> = [
    ["Cargo.toml", cargoToml(app, binName)],
    ["src/main.rs", MAIN_RS],
    ["build.rs", BUILD_RS],
    ["tauri.conf.json", tauriConf(input)],
    ["ui/index.html", loadingHtml(app.productName)],
    ["capabilities/default.json", defaultCapability()],
    ["capabilities/connect.json", connectCapability(connectPort)],
    [".gitignore", GITIGNORE],
    ["dist-stack/README.md", DIST_STACK_README],
  ];
  let changed = false;
  for (const [rel, content] of files) {
    if (writeIfChanged(path.join(shellDir, rel), content)) changed = true;
  }
  // Stage the icon source next to the shell (tauri icon reads it at build).
  const iconSrc = path.resolve(hostDir, app.icon);
  const iconDest = path.join(shellDir, ICON_SOURCE);
  if (fs.existsSync(iconSrc)) {
    const bytes = fs.readFileSync(iconSrc);
    if (!fs.existsSync(iconDest) || !fs.readFileSync(iconDest).equals(bytes)) {
      fs.mkdirSync(shellDir, { recursive: true });
      fs.writeFileSync(iconDest, bytes);
      changed = true;
    }
  }
  return { shellDir, binName, changed };
}
