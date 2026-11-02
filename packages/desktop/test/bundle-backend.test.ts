import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
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
