// External dependency detection on real @vercel/nft traces of tiny installed
// packages; a binary only has to exist for nft to follow a require to it.

import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { findRequiredFile } from "@powerhousedao/shared/build-pieces";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { traceFiles } from "../src/services/build.js";

let root: string;
const modules = () => join(root, "node_modules");
const entryOf = (name: string) => join(modules(), name, "index.js");
// nft reports real paths; macOS's tmpdir sits behind the /var symlink.
const realModules = () => join(realpathSync(root), "node_modules");

function write(file: string, content: string | Buffer) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
}

function installPackage(
  name: string,
  pkg: Record<string, unknown>,
  files: Record<string, string | Buffer>,
) {
  const dir = join(modules(), name);
  write(
    join(dir, "package.json"),
    JSON.stringify({ name, version: "1.0.0", main: "index.js", ...pkg }),
  );
  for (const [file, content] of Object.entries(files)) {
    write(join(dir, file), content);
  }
}

// pnpm links with junctions on Windows, where plain directory symlinks need privileges.
const linkType = process.platform === "win32" ? "junction" : "dir";
const binary = Buffer.from([0x7f, 0x45, 0x4c, 0x46]);
const wasm = Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "ph-external-deps-"));

  // Loads its own binary, like bufferutil.
  installPackage(
    "bufferutil",
    { version: "4.1.0" },
    {
      "index.js":
        'module.exports = require("./build/Release/bufferutil.node");\n',
      "build/Release/bufferutil.node": binary,
    },
  );

  // @duckdb/node-api -> node-bindings -> the per-platform binary package.
  installPackage(
    "@duckdb/node-api",
    { dependencies: { "@duckdb/node-bindings": "1.0.0" } },
    { "index.js": 'module.exports = require("@duckdb/node-bindings");\n' },
  );
  installPackage(
    "@duckdb/node-bindings",
    { optionalDependencies: { "@duckdb/node-bindings-linux-x64": "1.0.0" } },
    {
      "index.js":
        'module.exports = require("@duckdb/node-bindings-linux-x64/duckdb.node");\n',
    },
  );
  installPackage(
    "@duckdb/node-bindings-linux-x64",
    {},
    { "duckdb.node": binary },
  );

  // An optional peer: ws runs without bufferutil, even when it is installed.
  installPackage(
    "ws",
    {
      peerDependencies: { bufferutil: "^4.0.1" },
      peerDependenciesMeta: { bufferutil: { optional: true } },
    },
    {
      "index.js": [
        "let mask;",
        'try { mask = require("bufferutil"); } catch { mask = undefined; }',
        "module.exports = { mask };",
        "",
      ].join("\n"),
    },
  );

  installPackage("pure-js", {}, { "index.js": "module.exports = 42;\n" });

  // Reads its module from beside itself, like tiktoken: nft sees the read.
  installPackage(
    "wasm-beside",
    {},
    {
      "index.js": [
        'const { readFileSync } = require("node:fs");',
        'const { join } = require("node:path");',
        'module.exports = readFileSync(join(__dirname, "beside_bg.wasm"));',
        "",
      ].join("\n"),
      "beside_bg.wasm": wasm,
    },
  );

  // Its caller passes the module in, like @resvg/resvg-wasm: no read to trace.
  installPackage(
    "wasm-passed",
    {},
    {
      "index.js": "exports.initWasm = (bytes) => WebAssembly.compile(bytes);\n",
      "dist/passed_bg.wasm": wasm,
    },
  );
  installPackage(
    "uses-wasm",
    { dependencies: { "wasm-passed": "1.0.0" } },
    { "index.js": 'module.exports = require("wasm-passed");\n' },
  );
  installPackage(
    "wasm-optional",
    {
      peerDependencies: { "wasm-passed": "^1.0.0" },
      peerDependenciesMeta: { "wasm-passed": { optional: true } },
    },
    {
      "index.js":
        'try { module.exports = require("wasm-passed"); } catch { module.exports = {}; }\n',
    },
  );

  // pnpm's layout: every package under .pnpm, reached through symlinks.
  installPackage(
    ".pnpm/linked-native@1.0.0/node_modules/linked-native",
    { name: "linked-native", dependencies: { "linked-binding": "1.0.0" } },
    { "index.js": 'module.exports = require("linked-binding");\n' },
  );
  installPackage(
    ".pnpm/linked-binding@1.0.0/node_modules/linked-binding",
    { name: "linked-binding" },
    {
      "index.js": 'module.exports = require("./binding.node");\n',
      "binding.node": binary,
    },
  );
  symlinkSync(
    join(modules(), ".pnpm/linked-binding@1.0.0/node_modules/linked-binding"),
    join(modules(), ".pnpm/linked-native@1.0.0/node_modules/linked-binding"),
    linkType,
  );
  symlinkSync(
    join(modules(), ".pnpm/linked-native@1.0.0/node_modules/linked-native"),
    join(modules(), "linked-native"),
    linkType,
  );
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("findRequiredFile with nft", () => {
  it("finds the binary a package loads itself", async () => {
    const found = await findRequiredFile(entryOf("bufferutil"), traceFiles);
    expect(found?.kind).toBe("native");
    expect(found?.file).toBe(
      join(realModules(), "bufferutil", "build", "Release", "bufferutil.node"),
    );
  });

  it("follows dependencies and optionalDependencies to a per-platform binary", async () => {
    const found = await findRequiredFile(
      entryOf("@duckdb/node-api"),
      traceFiles,
    );
    expect(found?.kind).toBe("native");
    expect(found?.file).toBe(
      join(realModules(), "@duckdb", "node-bindings-linux-x64", "duckdb.node"),
    );
  });

  it("ignores a binary reached only through an optional peer", async () => {
    // nft does reach the binary; only the link to it is ruled out.
    const trace = await traceFiles(entryOf("ws"));
    expect([...trace.fileList]).toContain(
      join(realModules(), "bufferutil", "build", "Release", "bufferutil.node"),
    );
    expect(await findRequiredFile(entryOf("ws"), traceFiles)).toBe(undefined);
  });

  it("follows pnpm's symlinked layout from a linked entry", async () => {
    // A bundler hands over real paths; on Windows the trace cannot start from a linked one.
    const entry = entryOf("linked-native");
    const found = await findRequiredFile(
      process.platform === "win32" ? realpathSync(entry) : entry,
      traceFiles,
    );
    expect(found?.kind).toBe("native");
    // On Windows nft reports the binary through the junction it was reached by.
    expect(realpathSync.native(found!.file)).toBe(
      realpathSync.native(
        join(
          modules(),
          ".pnpm/linked-binding@1.0.0/node_modules/linked-binding/binding.node",
        ),
      ),
    );
  });

  it("finds a WebAssembly module the package reads beside itself", async () => {
    expect(await findRequiredFile(entryOf("wasm-beside"), traceFiles)).toEqual({
      kind: "wasm",
      file: join(realModules(), "wasm-beside", "beside_bg.wasm"),
    });
  });

  it("finds a WebAssembly module the package ships but nft cannot see read", async () => {
    const trace = await traceFiles(entryOf("wasm-passed"));
    expect([...trace.fileList].some((file) => file.endsWith(".wasm"))).toBe(
      false,
    );
    expect(await findRequiredFile(entryOf("wasm-passed"), traceFiles)).toEqual({
      kind: "wasm",
      file: join(realModules(), "wasm-passed", "dist", "passed_bg.wasm"),
    });
  });

  it("follows dependencies to a package that ships a WebAssembly module", async () => {
    expect(await findRequiredFile(entryOf("uses-wasm"), traceFiles)).toEqual({
      kind: "wasm",
      file: join(realModules(), "wasm-passed", "dist", "passed_bg.wasm"),
    });
  });

  it("ignores a WebAssembly package reached only through an optional peer", async () => {
    expect(await findRequiredFile(entryOf("wasm-optional"), traceFiles)).toBe(
      undefined,
    );
  });

  it("finds nothing in pure JavaScript", async () => {
    expect(await findRequiredFile(entryOf("pure-js"), traceFiles)).toBe(
      undefined,
    );
  });
});
