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
import { spawnSync } from "node:child_process";
import {
  bundleStack,
  readLocalPackages,
  pluginPackagesOf,
  pruneStack,
  stackManifest,
} from "../src/bundle-stack.js";
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
    writeFileSync(path.join(dir, "dist", "index.js"), "export {};");
    const connectBuild = path.join(".ph", "connect-build", "dist");
    mkdirSync(path.join(dir, connectBuild), { recursive: true });
    writeFileSync(path.join(dir, connectBuild, "index.html"), "<html></html>");
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
    expect(existsSync(path.join(result.stackDir, "dist", "index.js"))).toBe(
      true,
    );
    expect(
      existsSync(path.join(result.stackDir, connectBuild, "index.html")),
    ).toBe(true);
    const manifest = JSON.parse(
      readFileSync(path.join(result.stackDir, "package.json"), "utf8"),
    ) as { name: string; dependencies: Record<string, string> };
    expect(manifest.name).toBe("desk-lab");
    expect(manifest.dependencies["@powerhousedao/ph-run"]).toBe("dev");
    expect(manifest.dependencies).not.toHaveProperty("@powerhousedao/ph-cli");
  });
});

/** A `pnpm pack`-shaped tarball: package/package.json inside. */
function packTarball(dir: string, file: string, name: string): string {
  const src = tempDir("ph-desktop-pkg-");
  mkdirSync(path.join(src, "package"));
  writeFileSync(
    path.join(src, "package", "package.json"),
    JSON.stringify({ name, version: "1.0.0-dev.1" }),
  );
  const tarball = path.join(dir, file);
  const r = spawnSync("tar", ["-czf", file, "-C", src, "package"], {
    cwd: dir,
  });
  expect(r.status).toBe(0);
  return tarball;
}

describe("the package a stack is", () => {
  it("keeps the project's version and exports, which its pieces and models need", () => {
    const parent = tempDir("ph-desktop-identity-");
    const projectRoot = path.join(parent, "project");
    mkdirSync(projectRoot);
    const exports = { "./document-models": { node: "./dist/models.mjs" } };
    writeFileSync(
      path.join(projectRoot, "package.json"),
      JSON.stringify({ name: "lab", version: "1.2.3", exports }),
    );
    const { stackDir } = bundleStack({
      projectRoot,
      shellProjectDir: path.join(parent, "shell"),
      vendor: false,
      logger: () => undefined,
    });
    expect(
      JSON.parse(readFileSync(path.join(stackDir, "package.json"), "utf8")),
    ).toMatchObject({ name: "lab", version: "1.2.3", exports });
  });
});

describe("the OAuth clients a stack ships", () => {
  function stagedFrom(clients: Record<string, string>) {
    const parent = tempDir("ph-desktop-oauth-");
    const projectRoot = path.join(parent, "project");
    mkdirSync(projectRoot);
    writeFileSync(path.join(projectRoot, "package.json"), "{}");
    writeFileSync(path.join(parent, "desktop.json"), "the desktop client");
    writeFileSync(path.join(parent, "web.json"), "the web client");
    writeFileSync(
      path.join(projectRoot, "powerhouse.config.json"),
      JSON.stringify({
        keep: "this",
        workflows: { oauthApps: [{ id: "google", clients }] },
      }),
    );
    const logs: string[] = [];
    const { stackDir } = bundleStack({
      projectRoot,
      shellProjectDir: path.join(parent, "shell"),
      vendor: false,
      logger: (message) => logs.push(message),
    });
    const config = JSON.parse(
      readFileSync(path.join(stackDir, "powerhouse.config.json"), "utf8"),
    ) as {
      keep: string;
      workflows: { oauthApps: { clients: Record<string, string> }[] };
    };
    return { config, logs, stackDir };
  }

  it("moves the desktop client inside the stack, and leaves the web one out", () => {
    const { config, stackDir } = stagedFrom({
      desktop: "../desktop.json",
      web: "../web.json",
    });
    expect(config.keep).toBe("this");
    expect(config.workflows.oauthApps[0].clients).toEqual({
      desktop: "./oauth/desktop.json",
    });
    expect(
      readFileSync(path.join(stackDir, "oauth/desktop.json"), "utf8"),
    ).toBe("the desktop client");
    expect(existsSync(path.join(stackDir, "oauth/web.json"))).toBe(false);
  });

  it("says so when the desktop client isn't there", () => {
    const { config, logs } = stagedFrom({ desktop: "../missing.json" });
    expect(config.workflows.oauthApps[0].clients).toEqual({});
    expect(logs.join(" ")).toContain("no desktop client");
  });
});

describe("the AI demo key a stack ships", () => {
  function stagedFrom(demoKeyFile: string) {
    const parent = tempDir("ph-desktop-demo-");
    const projectRoot = path.join(parent, "project");
    mkdirSync(projectRoot);
    writeFileSync(path.join(projectRoot, "package.json"), "{}");
    writeFileSync(path.join(parent, "demo-key.txt"), "the demo key");
    writeFileSync(
      path.join(projectRoot, "powerhouse.config.json"),
      JSON.stringify({ ai: { demoKeyFile } }),
    );
    const logs: string[] = [];
    const { stackDir } = bundleStack({
      projectRoot,
      shellProjectDir: path.join(parent, "shell"),
      vendor: false,
      logger: (message) => logs.push(message),
    });
    const config = JSON.parse(
      readFileSync(path.join(stackDir, "powerhouse.config.json"), "utf8"),
    ) as { ai: { demoKeyFile?: string } };
    return { config, logs, stackDir };
  }

  it("moves it inside the stack", () => {
    const { config, stackDir } = stagedFrom("../demo-key.txt");
    expect(config.ai.demoKeyFile).toBe("./ai/demo-key.txt");
    expect(readFileSync(path.join(stackDir, "ai/demo-key.txt"), "utf8")).toBe(
      "the demo key",
    );
  });

  it("ships none when the file isn't there, as on a build with no secrets", () => {
    const { config, logs, stackDir } = stagedFrom("../missing.txt");
    expect(config.ai.demoKeyFile).toBeUndefined();
    expect(existsSync(path.join(stackDir, "ai"))).toBe(false);
    expect(logs.join(" ")).toContain("no AI demo key");
  });
});

describe("what a stack leaves out", () => {
  function stackWith(files: string[]): string {
    const dir = tempDir("ph-desktop-prune-");
    for (const file of files) {
      mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
      writeFileSync(path.join(dir, file), "x");
    }
    return dir;
  }

  it("removes what nothing reads at runtime, and folders that leaves empty", () => {
    const dir = stackWith([
      "node_modules/a/index.d.ts",
      "node_modules/a/index.d.mts",
      "node_modules/a/index.js.map",
      "node_modules/a/index.test.js",
      "node_modules/a/README.md",
      "node_modules/a/CHANGELOG.md",
      "node_modules/a/__tests__/deep/case.js",
      "node_modules/a/types/only.d.ts",
      "dist/types/thing.d.ts",
      "hosts/connect/page.test.tsx",
    ]);

    expect(pruneStack(dir)).toBe(10);
    expect(existsSync(path.join(dir, "node_modules/a/types"))).toBe(false);
    expect(existsSync(path.join(dir, "dist/types"))).toBe(false);
  });

  it("keeps code, licences, and the project's own notes", () => {
    const kept = [
      "node_modules/a/index.js",
      "node_modules/a/LICENSE",
      "node_modules/a/LICENSE.md",
      "node_modules/a/package.json",
      "node_modules/a/map.js",
      "node_modules/a/pglite.wasm",
      "node_modules/a/test/fixture.js",
      "agents/README.md",
    ];
    const dir = stackWith(kept);

    expect(pruneStack(dir)).toBe(0);
    for (const file of kept)
      expect(existsSync(path.join(dir, file))).toBe(true);
  });
});

describe("the plugins a stack ships", () => {
  it("names the package of each plugin that resolves in Node", () => {
    const connectBuiltIn = "@powerhousedao/connect/plugins/workflows";
    const packages = pluginPackagesOf(
      [
        "@powerhousedao/portle/switchboard",
        { module: "@powerhousedao/switchboard/plugins/ai", config: {} },
        { module: "off-plugin", enabled: false },
        "plain-plugin/entry",
        "./local-plugin.js",
        connectBuiltIn,
      ],
      "hosts/x/host.js",
      (specifier) => specifier !== connectBuiltIn,
    );
    expect(packages).toEqual([
      "@powerhousedao/portle",
      "@powerhousedao/switchboard",
      "plain-plugin",
    ]);
  });

  it("depends on them, from a tarball when there is one", () => {
    const manifest = stackManifest({
      name: "lab",
      version: "6.0.0",
      local: { "@powerhousedao/portle": "file:/p/portle.tgz" },
      plugins: ["@powerhousedao/portle", "plain-plugin"],
    });
    expect(manifest.dependencies).toMatchObject({
      "@powerhousedao/portle": "file:/p/portle.tgz",
      "plain-plugin": "6.0.0",
    });
  });
});

describe("bundle-stack local packages", () => {
  it("names each tarball by the package inside it", () => {
    const dir = tempDir("ph-desktop-packs-");
    const cli = packTarball(
      dir,
      "powerhousedao-ph-cli-1.tgz",
      "@powerhousedao/ph-cli",
    );
    const dm = packTarball(dir, "document-model-1.tgz", "document-model");
    writeFileSync(path.join(dir, "notes.txt"), "not a tarball");
    expect(readLocalPackages(dir)).toEqual({
      "@powerhousedao/ph-cli": `file:${cli}`,
      "document-model": `file:${dm}`,
    });
    expect(() => readLocalPackages(tempDir("ph-desktop-empty-"))).toThrow(
      /no package tarballs/,
    );
    packTarball(dir, "powerhousedao-ph-cli-0.tgz", "@powerhousedao/ph-cli");
    expect(() => readLocalPackages(dir)).toThrow(
      /two tarballs for @powerhousedao\/ph-cli/,
    );
  });

  it("overrides every local package and names the same spec directly", () => {
    const local = {
      "@powerhousedao/ph-run": "file:/p/ph-run.tgz",
      "@powerhousedao/host-core": "file:/p/host-core.tgz",
      "@powerhousedao/shared": "file:/p/shared.tgz",
    };
    expect(stackManifest({ name: "lab", version: "dev", local })).toEqual({
      name: "lab",
      private: true,
      type: "module",
      dependencies: {
        "@powerhousedao/ph-run": "file:/p/ph-run.tgz",
        "@powerhousedao/host-core": "file:/p/host-core.tgz",
      },
      overrides: local,
    });
    // what the directory lacks comes from the registry (or phCliSpec)
    const partial = stackManifest({
      name: "lab",
      version: "6.0.0",
      phCliSpec: "/p/run.tgz",
      local: { "@powerhousedao/shared": "file:/p/shared.tgz" },
    });
    expect(partial.dependencies).toEqual({
      "@powerhousedao/ph-run": "/p/run.tgz",
      "@powerhousedao/host-core": "6.0.0",
    });
    expect(stackManifest({ name: "lab", version: "dev" })).not.toHaveProperty(
      "overrides",
    );
  });

  it("stages the local manifest even with vendoring off", () => {
    const dir = makeProject();
    const packs = tempDir("ph-desktop-packs-");
    const cli = packTarball(packs, "cli.tgz", "@powerhousedao/ph-cli");
    const result = bundleStack({
      projectRoot: dir,
      shellProjectDir: makeShellProject(),
      vendor: false,
      localPackagesDir: packs,
      logger: () => undefined,
    });
    const manifest = JSON.parse(
      readFileSync(path.join(result.stackDir, "package.json"), "utf8"),
    ) as { overrides: Record<string, string> };
    expect(manifest.overrides).toEqual({
      "@powerhousedao/ph-cli": `file:${cli}`,
    });
  });
});
