import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withNodeDedupe } from "./node-dedupe.js";

// A project and a linked checkout, each with its own copy of `dup`. Consumers
// live in the checkout's node_modules, as an externalized dependency does.
let dir: string;
let root: string;
let checkout: string;

function pkg(at: string, name: string, files: Record<string, string>) {
  const pkgDir = join(at, "node_modules", name);
  mkdirSync(pkgDir, { recursive: true });
  writeFileSync(
    join(pkgDir, "package.json"),
    JSON.stringify({
      name,
      type: "module",
      exports: {
        ".": "./index.js",
        "./sub": { import: "./sub.js", require: "./sub.cjs" },
      },
    }),
  );
  for (const [file, text] of Object.entries(files)) {
    writeFileSync(join(pkgDir, file), text);
  }
}

// Each case imports its own consumer: Node caches a module by URL.
function consumer(name: string, specifier: string) {
  pkg(checkout, name, { "index.js": `export { who } from "${specifier}";` });
  const url = pathToFileURL(join(checkout, "node_modules", name, "index.js"));
  return () => import(url.href) as Promise<{ who: string }>;
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "node-dedupe-"));
  root = join(dir, "project");
  checkout = join(dir, "checkout");
  for (const [at, who] of [
    [root, "project"],
    [checkout, "checkout"],
  ]) {
    pkg(at, "dup", {
      "index.js": `export const who = "${who}";`,
      "sub.js": `export const who = "${who}/sub";`,
      "sub.cjs": `exports.who = "${who}/sub/cjs";`,
    });
  }
  pkg(checkout, "solo", { "index.js": `export const who = "solo";` });
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("withNodeDedupe", () => {
  it("resolves a deduped package and its subpaths from the root", async () => {
    const root1 = consumer("c-root", "dup");
    const sub = consumer("c-sub", "dup/sub");
    const [a, b] = await withNodeDedupe(root, ["dup"], () =>
      Promise.all([root1(), sub()]),
    );
    expect(a.who).toBe("project");
    expect(b.who).toBe("project/sub");
  });

  it("pins a CommonJS require as well as an import", async () => {
    pkg(checkout, "c-cjs", {
      "index.cjs": `exports.who = require("dup/sub").who;`,
    });
    const url = pathToFileURL(
      join(checkout, "node_modules", "c-cjs", "index.cjs"),
    );
    const loaded = await withNodeDedupe(
      root,
      ["dup"],
      () => import(url.href) as Promise<{ default: { who: string } }>,
    );
    expect(loaded.default.who).toBe("project/sub/cjs");
  });

  it("leaves a package the root lacks, and other packages, to the importer", async () => {
    const solo = consumer("c-solo", "solo");
    expect((await withNodeDedupe(root, ["solo"], solo)).who).toBe("solo");
    const other = consumer("c-other", "dup");
    expect((await withNodeDedupe(root, ["unrelated"], other)).who).toBe(
      "checkout",
    );
  });

  it("removes its hooks when fn settles, even on failure", async () => {
    await expect(
      withNodeDedupe(root, ["dup"], () => Promise.reject(new Error("boom"))),
    ).rejects.toThrow("boom");
    const after = consumer("c-after", "dup");
    expect((await after()).who).toBe("checkout");
  });
});
