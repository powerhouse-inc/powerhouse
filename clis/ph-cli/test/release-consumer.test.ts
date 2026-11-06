import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { checkPackedConsumer } from "../src/services/release/consumer.js";
import { packRelease } from "../src/services/release/pack.js";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

function probe(
  manifest: Readonly<Record<string, unknown>>,
  files: Readonly<Record<string, string>>,
): string {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), "ph-consumer-")));
  roots.push(root);
  const all = {
    "package.json": JSON.stringify({
      name: "probe",
      version: "1.0.0",
      type: "module",
      files: ["dist"],
      ...manifest,
    }),
    ...files,
  };
  for (const [path, text] of Object.entries(all)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}

async function consumerFailures(
  root: string,
  unbuilt: readonly string[] = [],
): Promise<string[]> {
  const packed = packRelease(root);
  try {
    return await checkPackedConsumer(root, packed, new Set(unbuilt));
  } finally {
    packed.dispose();
  }
}

describe("the packed-consumer check", () => {
  it("passes a module that writes to stdout as it loads", async () => {
    const root = probe(
      { exports: "./dist/index.js" },
      {
        "dist/index.js":
          'console.log("model loaded");\nexport const value = 1;\n',
      },
    );

    expect(await consumerFailures(root)).toEqual([]);
  });

  it("imports the browser target for the browser consumer when node comes first", async () => {
    const root = probe(
      { exports: { node: "./dist/node.js", browser: "./dist/browser.js" } },
      {
        "dist/node.js": "export const value = 1;\n",
        "dist/browser.js":
          'import "missing-browser-runtime";\nexport const value = 1;\n',
      },
    );

    expect(await consumerFailures(root)).toEqual([
      "browser consumer cannot import probe: Cannot find package 'missing-browser-runtime' imported from node_modules/probe/dist/browser.js",
    ]);
  });

  it("resolves a dependency's exports under browser conditions in the browser consumer", async () => {
    const root = probe(
      {
        exports: { browser: "./dist/browser.js", node: "./dist/node.js" },
        dependencies: { dep: "1.0.0" },
      },
      {
        "dist/node.js": "export const value = 1;\n",
        "dist/browser.js": 'export { value } from "dep";\n',
        "node_modules/dep/package.json": JSON.stringify({
          name: "dep",
          version: "1.0.0",
          type: "module",
          exports: { node: "./node.js", browser: "./browser.js" },
        }),
        "node_modules/dep/node.js": "export const value = 1;\n",
        "node_modules/dep/browser.js": 'export { value } from "./gone.js";\n',
      },
    );

    expect(await consumerFailures(root)).toEqual([
      expect.stringMatching(
        /^browser consumer cannot import probe: Cannot find module '.*\/dep\/gone\.js' imported from .*\/dep\/browser\.js$/,
      ),
    ]);
  });

  it("refuses an export whose targets are all missing", async () => {
    const root = probe(
      {
        exports: {
          ".": "./dist/index.js",
          "./document-models": "./dist/document-modles/index.js",
        },
      },
      { "dist/index.js": "export const value = 1;\n" },
    );

    expect(await consumerFailures(root)).toEqual([
      'exports["./document-models"] names ./dist/document-modles/index.js, which the package does not contain',
      "node consumer cannot import probe/document-models: Cannot find module 'node_modules/probe/dist/document-modles/index.js'",
      "browser consumer cannot import probe/document-models: Cannot find module 'node_modules/probe/dist/document-modles/index.js'",
    ]);
  });

  it("skips only the entries the build did not write", async () => {
    const root = probe(
      {
        exports: {
          ".": "./dist/index.js",
          "./scalars": "./dist/scalars/index.js",
          "./pieces": { node: "./dist/node/pieces/index.mjs" },
        },
      },
      { "dist/index.js": "export const value = 1;\n" },
    );

    expect(await consumerFailures(root, ["./scalars", "./pieces"])).toEqual([]);
    expect(await consumerFailures(root, ["./pieces"])).toEqual([
      'exports["./scalars"] names ./dist/scalars/index.js, which the package does not contain',
      "node consumer cannot import probe/scalars: Cannot find module 'node_modules/probe/dist/scalars/index.js'",
      "browser consumer cannot import probe/scalars: Cannot find module 'node_modules/probe/dist/scalars/index.js'",
    ]);
  });
});
