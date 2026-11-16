import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  bundleBackend,
  closureOf,
  entryNameOf,
  exportedFiles,
  keptManifest,
  packageOf,
  serverTarget,
} from "../src/bundle-backend.js";

const temporary: string[] = [];
afterEach(() => {
  for (const dir of temporary.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

/** A package folder holding the given files. */
function packageWith(files: string[]): string {
  const dir = mkdtempSync(path.join(tmpdir(), "ph-bundle-backend-"));
  temporary.push(dir);
  for (const file of files) {
    mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    writeFileSync(path.join(dir, file), "");
  }
  return dir;
}

describe("serverTarget", () => {
  it("takes what a server would, not a browser's build", () => {
    expect(
      serverTarget({
        types: "./x.d.ts",
        browser: "./browser.js",
        node: "./node.mjs",
      }),
    ).toBe("./node.mjs");
  });

  it("falls back to import, then default", () => {
    expect(serverTarget({ import: "./i.js", default: "./d.js" })).toBe(
      "./i.js",
    );
    expect(serverTarget({ default: "./d.js" })).toBe("./d.js");
  });

  it("reads nested conditions, and finds nothing where a browser has it all", () => {
    expect(serverTarget({ node: { import: "./n.mjs" } })).toBe("./n.mjs");
    expect(serverTarget({ browser: "./b.js" })).toBeNull();
    expect(serverTarget(null)).toBeNull();
  });
});

describe("exportedFiles", () => {
  it("lists a package's subpaths, without the manifest's own", () => {
    const dir = packageWith(["dist/index.js", "dist/a.js"]);
    const files = exportedFiles(dir, {
      exports: {
        ".": { node: "./dist/index.js" },
        "./a": "./dist/a.js",
        "./package.json": "./package.json",
      },
    });
    expect([...files]).toEqual([
      [".", "dist/index.js"],
      ["./a", "dist/a.js"],
    ]);
  });

  it("skips a subpath its server build doesn't have", () => {
    const dir = packageWith(["dist/index.js"]);
    expect(
      exportedFiles(dir, {
        exports: {
          ".": "./dist/index.js",
          "./editors": { node: "./dist/node/editors/index.mjs" },
        },
      }).has("./editors"),
    ).toBe(false);
  });

  it("lists what a wildcard matches, by file and by folder", () => {
    const dir = packageWith([
      "dist/connect/a.js",
      "dist/connect/b.js",
      "dist/connect/b.js.map",
      "dist/models/invoice/index.mjs",
      "dist/models/file/index.mjs",
      "dist/models/empty/other.mjs",
    ]);
    const files = exportedFiles(dir, {
      exports: {
        "./connect/*": "./dist/connect/*.js",
        "./models/*": { node: "./dist/models/*/index.mjs" },
      },
    });
    expect(Object.fromEntries(files)).toEqual({
      "./connect/a": "dist/connect/a.js",
      "./connect/b": "dist/connect/b.js",
      "./models/file": "dist/models/file/index.mjs",
      "./models/invoice": "dist/models/invoice/index.mjs",
    });
  });

  it("takes main where a package has no exports", () => {
    const dir = packageWith(["lib/main.js"]);
    expect(exportedFiles(dir, { main: "./lib/main.js" }).get(".")).toBe(
      "lib/main.js",
    );
    const bare = packageWith(["index.js"]);
    expect(exportedFiles(bare, {}).get(".")).toBe("index.js");
  });
});

describe("entryNameOf", () => {
  it("keeps every entry in its package's own folder, flat", () => {
    expect(entryNameOf("document-model", ".")).toBe("document-model/index");
    expect(entryNameOf("@powerhousedao/shared", "./connect/app-shell")).toBe(
      "@powerhousedao/shared/connect__app-shell",
    );
  });
});

describe("keptManifest", () => {
  it("keeps what resolves a package, and nothing that would install one", () => {
    expect(
      keptManifest(
        {
          name: "document-model",
          version: "1.2.3",
          dependencies: { zod: "4" },
          exports: { ".": "./dist/index.js" },
        },
        new Map([[".", "index.mjs"]]),
      ),
    ).toEqual({
      name: "document-model",
      version: "1.2.3",
      type: "module",
      exports: {
        "./package.json": "./package.json",
        ".": "./index.mjs",
      },
    });
  });
});

describe("closureOf", () => {
  const lock = {
    "node_modules/a": { dependencies: { b: "1" } },
    "node_modules/a/node_modules/c": {},
    "node_modules/b": {
      dependencies: { c: "1" },
      optionalDependencies: { d: "1" },
    },
    "node_modules/c": {},
    "node_modules/d": {},
    "node_modules/unrelated": {},
  };

  it("takes in what a kept package needs, and no more", () => {
    expect([...closureOf(lock, ["b"])].sort()).toEqual([
      "node_modules/b",
      "node_modules/c",
      "node_modules/d",
    ]);
  });

  it("resolves a dependency as node would, from the nearest install", () => {
    const nested = {
      "node_modules/a": { dependencies: { c: "1" } },
      "node_modules/a/node_modules/c": {},
      "node_modules/c": {},
    };
    expect([...closureOf(nested, ["a"])].sort()).toEqual([
      "node_modules/a",
      "node_modules/a/node_modules/c",
    ]);
  });

  it("ignores what isn't installed", () => {
    expect(closureOf(lock, ["missing"]).size).toBe(0);
  });

  it("keeps an installed peer when asked, which its dependent may load", () => {
    const peers = {
      "node_modules/loader": {
        peerDependencies: { engine: "1", absent: "1" },
        peerDependenciesMeta: { engine: { optional: true } },
      },
      "node_modules/engine": {},
    };
    expect([...closureOf(peers, ["loader"], { peers: true })].sort()).toEqual([
      "node_modules/engine",
      "node_modules/loader",
    ]);
    expect([...closureOf(peers, ["loader"])]).toEqual(["node_modules/loader"]);
  });
});

/** A staged stack: each file with its text, and a lockfile of `packages`. */
function stackWith(
  files: Record<string, string>,
  packages: Record<string, object>,
): string {
  const dir = mkdtempSync(path.join(tmpdir(), "ph-bundle-stack-"));
  temporary.push(dir);
  const runtime = {
    "node_modules/@powerhousedao/ph-run/package.json": "{}",
    "node_modules/@powerhousedao/ph-run/dist/cli.mjs": "export {};",
    "node_modules/@powerhousedao/reactor-api/package.json": "{}",
    "node_modules/@powerhousedao/reactor-api/dist/src/pglite/worker/entry.mjs":
      "export {};",
    "node_modules/@powerhousedao/reactor-workflow/package.json": "{}",
    "node_modules/@powerhousedao/reactor-workflow/dist/worker-entry.js":
      "export {};",
  };
  for (const [file, text] of Object.entries({ ...runtime, ...files })) {
    mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    writeFileSync(path.join(dir, file), text);
  }
  writeFileSync(
    path.join(dir, "package-lock.json"),
    JSON.stringify({ packages }),
  );
  return dir;
}

describe("bundleBackend", () => {
  it("keeps what the pieces load, which nothing in the bundle imports", async () => {
    const manifest = (dependencies: Record<string, string>) =>
      JSON.stringify({ dependencies });
    const stack = stackWith(
      {
        "package.json": manifest({
          "@powerhousedao/ph-run": "1",
          "editor-lib": "1",
          "engine-loader": "1",
        }),
        // Resolved at run time, so the piece's build never traced it.
        "dist/node/pieces/convert/index.mjs":
          'export const load = () => require.resolve("engine-loader/pdf");',
        "dist/node/pieces/convert/package.json": manifest({}),
        "node_modules/editor-lib/package.json": "{}",
        "node_modules/engine-loader/package.json": "{}",
        "node_modules/native-engine/package.json": "{}",
        "node_modules/@powerhousedao/plugin/package.json": manifest({
          "plugin-engine": "1",
          "plugin-ui": "1",
        }),
        "node_modules/@powerhousedao/plugin/dist/node/pieces/ocr/index.mjs":
          'export const ocr = () => import("plugin-engine");',
        "node_modules/@powerhousedao/plugin/dist/node/pieces/ocr/package.json":
          manifest({ "piece-engine": "1" }),
        "node_modules/plugin-engine/package.json": "{}",
        "node_modules/plugin-ui/package.json": "{}",
        "node_modules/piece-engine/package.json": "{}",
        "node_modules/unrelated/package.json": "{}",
      },
      {
        "": {
          dependencies: {
            "@powerhousedao/ph-run": "1",
            "editor-lib": "1",
            "engine-loader": "1",
          },
        },
        "node_modules/@powerhousedao/ph-run": {
          dependencies: { "native-engine": "1", unrelated: "1" },
        },
        "node_modules/@powerhousedao/reactor-api": {},
        "node_modules/@powerhousedao/reactor-workflow": {},
        "node_modules/@powerhousedao/plugin": {
          dependencies: { "plugin-engine": "1", "plugin-ui": "1" },
        },
        "node_modules/editor-lib": {},
        // Loads its engine by name, so declares it as an optional peer.
        "node_modules/engine-loader": {
          peerDependencies: { "native-engine": "1" },
          peerDependenciesMeta: { "native-engine": { optional: true } },
        },
        "node_modules/native-engine": {},
        "node_modules/plugin-engine": {},
        "node_modules/plugin-ui": {},
        "node_modules/piece-engine": {},
        "node_modules/unrelated": {},
      },
    );

    await bundleBackend({ stackDir: stack });

    const names = [
      "engine-loader",
      "native-engine",
      "plugin-engine",
      "piece-engine",
      "editor-lib",
      "plugin-ui",
      "unrelated",
    ];
    const installed = Object.fromEntries(
      names.map((name) => [
        name,
        existsSync(path.join(stack, "node_modules", name, "package.json")),
      ]),
    );
    expect(installed).toEqual({
      "engine-loader": true,
      "native-engine": true,
      "plugin-engine": true,
      "piece-engine": true,
      "editor-lib": false,
      "plugin-ui": false,
      unrelated: false,
    });
    expect(
      existsSync(
        path.join(
          stack,
          "node_modules/@powerhousedao/plugin/dist/node/pieces/ocr/package.json",
        ),
      ),
    ).toBe(true);
  });

  it("folds a package's dependencies when it ships no pieces", async () => {
    const stack = stackWith(
      {
        "package.json": JSON.stringify({
          dependencies: { "@powerhousedao/ph-run": "1" },
        }),
        "node_modules/@powerhousedao/plugin/package.json": JSON.stringify({
          dependencies: { "plugin-ui": "1" },
        }),
        "node_modules/plugin-ui/package.json": "{}",
      },
      {
        "": { dependencies: { "@powerhousedao/ph-run": "1" } },
        "node_modules/@powerhousedao/ph-run": {},
        "node_modules/@powerhousedao/reactor-api": {},
        "node_modules/@powerhousedao/reactor-workflow": {},
        "node_modules/@powerhousedao/plugin": {
          dependencies: { "plugin-ui": "1" },
        },
        "node_modules/plugin-ui": {},
      },
    );

    await bundleBackend({ stackDir: stack });

    expect(
      existsSync(path.join(stack, "node_modules/plugin-ui/package.json")),
    ).toBe(false);
  });
});

describe("packageOf", () => {
  it("names the package of a bare import", () => {
    expect(packageOf("react")).toBe("react");
    expect(packageOf("semver/functions/valid")).toBe("semver");
    expect(packageOf("@scope/name/deep/file.js")).toBe("@scope/name");
  });

  it("names nothing for a path or a built-in", () => {
    expect(packageOf("./chunk.mjs")).toBeNull();
    expect(packageOf("../chunk.mjs")).toBeNull();
    expect(packageOf("node:fs")).toBeNull();
    expect(packageOf("/abs/file.js")).toBeNull();
  });
});
