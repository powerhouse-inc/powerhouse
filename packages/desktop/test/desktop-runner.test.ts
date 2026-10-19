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
import { bundleStack } from "../src/bundle-stack.js";
import { resolveShell, shellEnv, tauriConfigPatch } from "../src/shell.js";
import * as runner from "../src/runner.js";

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

/** A hosts project with a fake ph-cli and fake member runners. */
function makeProject(): string {
  const dir = tempDir("ph-desktop-proj-");
  writeFileSync(path.join(dir, "powerhouse.config.json"), "{}");
  writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify({ name: "desk-lab", type: "module" }),
  );
  const phCliDir = path.join(dir, "node_modules", "@powerhousedao", "ph-cli");
  mkdirSync(path.join(phCliDir, "dist"), { recursive: true });
  writeFileSync(
    path.join(phCliDir, "package.json"),
    JSON.stringify({ name: "@powerhousedao/ph-cli", type: "module" }),
  );
  writeFileSync(path.join(phCliDir, "dist", "cli.mjs"), "// fake\n");

  const fakeDir = path.join(dir, "node_modules", "fake-runner");
  mkdirSync(fakeDir, { recursive: true });
  writeFileSync(
    path.join(fakeDir, "package.json"),
    JSON.stringify({
      name: "fake-runner",
      type: "module",
      exports: { ".": { import: "./index.js", default: "./index.js" } },
    }),
  );
  writeFileSync(
    path.join(fakeDir, "index.js"),
    `
import { appendFileSync } from "node:fs";
export const kind = "reactor";
export const hostSchema = { safeParse: (host) => ({ success: true, data: host }) };
export async function run() {}
export async function build(host) {
  appendFileSync(process.env.BUILD_SINK, JSON.stringify({ built: host.name }) + "\\n");
}
`,
  );
  const noBuildDir = path.join(dir, "node_modules", "no-build-runner");
  mkdirSync(noBuildDir, { recursive: true });
  writeFileSync(
    path.join(noBuildDir, "package.json"),
    JSON.stringify({
      name: "no-build-runner",
      type: "module",
      exports: { ".": { import: "./index.js", default: "./index.js" } },
    }),
  );
  writeFileSync(
    path.join(noBuildDir, "index.js"),
    `export const kind = "reactor";
export const hostSchema = { safeParse: (host) => ({ success: true, data: host }) };
export async function run() {}
`,
  );

  const write = (name: string, source: string) => {
    const d = path.join(dir, "hosts", name);
    mkdirSync(d, { recursive: true });
    writeFileSync(path.join(d, "host.js"), source);
  };
  write(
    "connect",
    `export default { name: "desk-connect", runner: { module: "fake-runner", port: 6123 } };`,
  );
  write(
    "switchboard",
    `export default { name: "desk-switchboard", runner: { module: "no-build-runner", port: 7123 } };`,
  );
  write(
    "desktop",
    `export default {
      name: "desktop",
      runner: { module: "@powerhousedao/desktop/runner" },
      children: {
        "desktop-switchboard": { host: "switchboard" },
        "desktop-connect": { host: "connect" },
      },
      config: { runtimeRecord: false },
    };`,
  );
  return dir;
}

function makeShellProject(): string {
  const dir = tempDir("ph-desktop-shell-");
  mkdirSync(path.join(dir, "src-tauri"), { recursive: true });
  return dir;
}

const ctx = (dir: string, verb = "run") => ({
  projectRoot: dir,
  verb,
  env: {} as Record<string, string | undefined>,
});

describe("shell resolution", () => {
  it("fails loudly when nothing names a shell", () => {
    expect(() => resolveShell("/proj", undefined, {})).toThrow(
      /runner\.shell\.project.*PH_DESKTOP_SHELL/s,
    );
  });

  it("resolves a configured checkout and finds no exe gracefully", () => {
    const shell = makeShellProject();
    const resolved = resolveShell("/proj", { project: shell }, {});
    expect(resolved.projectDir).toBe(shell);
    expect(resolved.exe).toBeUndefined();
  });

  it("prefers a built exe when present", () => {
    const shell = makeShellProject();
    const exe = path.join(shell, "src-tauri", "target", "debug", "ph-win.exe");
    mkdirSync(path.dirname(exe), { recursive: true });
    writeFileSync(exe, "");
    expect(resolveShell("/proj", { project: shell }, {}).exe).toBe(exe);
  });

  it("honors PH_DESKTOP_SHELL when the host file names none", () => {
    const shell = makeShellProject();
    expect(
      resolveShell("/proj", undefined, { PH_DESKTOP_SHELL: shell }).projectDir,
    ).toBe(shell);
  });
});

describe("env wiring and config projection", () => {
  it("wires the env trio from the project", () => {
    const dir = makeProject();
    const env = shellEnv(dir, 6123, {});
    expect(env.FEATURE_UNIFORM_RUNNERS_ENABLED).toBe("1");
    expect(env.PH_RUN_PROJECT).toBe(dir);
    expect(env.PH_RUN_CLI).toContain(path.join("ph-cli", "dist", "cli.mjs"));
    expect(env.PH_WIN_CONNECT_PORT).toBe("6123");
  });

  it("projects window + file associations into a tauri --config patch", () => {
    const patch = tauriConfigPatch({
      window: { title: "My Product", width: 1440 },
      fileAssociations: [".phd"],
    });
    expect(patch).toEqual({
      app: { windows: [{ title: "My Product", width: 1440 }] },
      bundle: {
        fileAssociations: [{ ext: ["phd"], name: "Powerhouse Document" }],
      },
    });
    expect(tauriConfigPatch(undefined)).toBeUndefined();
    expect(tauriConfigPatch({})).toBeUndefined();
  });
});

describe("build verb", () => {
  it("builds members that export build, skips the rest with a note", async () => {
    const dir = makeProject();
    const sink = path.join(dir, "build-sink.jsonl");
    process.env.BUILD_SINK = sink;
    const { loadHost } = await import("@powerhousedao/host-core");
    const host = runner.hostSchema.parse((await loadHost(dir, "desktop")).host);
    try {
      await runner.build(host, ctx(dir, "build"));
    } finally {
      delete process.env.BUILD_SINK;
    }
    const built = readFileSync(sink, "utf8").trim();
    expect(JSON.parse(built)).toEqual({ built: "desk-connect" });
  });
});

describe("bundle-stack staging", () => {
  it("stages hosts, config, dist and the manifest (vendor off)", () => {
    const dir = makeProject();
    mkdirSync(path.join(dir, "dist"), { recursive: true });
    writeFileSync(path.join(dir, "dist", "index.html"), "<html></html>");
    const shell = makeShellProject();

    const result = bundleStack({
      projectRoot: dir,
      shellProjectDir: shell,
      vendor: false,
      connectPort: 6123,
      logger: () => undefined,
    });

    expect(result.vendored).toBe(false);
    // shell.json carries the probe/window port for the no-env packaged path.
    expect(
      JSON.parse(
        readFileSync(path.join(result.stackDir, "shell.json"), "utf8"),
      ),
    ).toEqual({ connectPort: 6123 });
    // The staged desktop host must run on the generic compound: inside the
    // package the shell IS the window — no nested shell runner.
    const stagedHost = readFileSync(
      path.join(result.stackDir, "hosts", "desktop", "host.js"),
      "utf8",
    );
    expect(stagedHost).not.toContain("@powerhousedao/desktop/runner");
    expect(stagedHost).toContain("@powerhousedao/host-core/runners/compound");
    expect(
      existsSync(path.join(result.stackDir, "hosts", "desktop", "host.js")),
    ).toBe(true);
    expect(
      existsSync(path.join(result.stackDir, "powerhouse.config.json")),
    ).toBe(true);
    expect(existsSync(path.join(result.stackDir, "dist", "index.html"))).toBe(
      true,
    );
    const manifest = JSON.parse(
      readFileSync(path.join(result.stackDir, "package.json"), "utf8"),
    ) as { name: string; dependencies: Record<string, string> };
    expect(manifest.name).toBe("desk-lab");
    expect(manifest.dependencies["@powerhousedao/ph-cli"]).toBe("dev");
  });
});
