import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { build } from "vite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { reactSelfHostPlugin } from "./react-self-host.js";

// Inside cwd: Vite 8's build-html rejects an index.html outside it.
const TMP_PARENT = join(process.cwd(), "node_modules");

const require = createRequire(import.meta.url);
// builder-tools has no react deps; borrow a sibling's matching pair.
const reactRequire = createRequire(
  join(import.meta.dirname, "../../../reactor-browser/package.json"),
);
const pkgDir = (name: string) =>
  dirname(reactRequire.resolve(`${name}/package.json`));
const viteDir = dirname(dirname(dirname(require.resolve("vite"))));

describe("reactSelfHostPlugin build", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(TMP_PARENT, ".react-self-host-e2e-"));
    mkdirSync(join(root, "node_modules"));
    for (const name of ["react", "react-dom"]) {
      symlinkSync(pkgDir(name), join(root, "node_modules", name), "dir");
    }
    symlinkSync(viteDir, join(root, "node_modules", "vite"), "dir");
    writeFileSync(
      join(root, "index.html"),
      `<!doctype html><html><head></head><body><script type="module" src="/main.js"></script></body></html>`,
    );
    writeFileSync(join(root, "main.js"), `console.log("hello");`);
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it("emits a world-readable __react__ that backs every import-map entry", async () => {
    const outDir = join(root, "dist");
    await build({
      root,
      logLevel: "silent",
      build: { outDir, emptyOutDir: true },
      plugins: [reactSelfHostPlugin({ dirname: root })],
    });

    const html = readFileSync(join(outDir, "index.html"), "utf8");
    const json = /<script type="importmap">(.*?)<\/script>/s.exec(html)?.[1];
    expect(json).toBeDefined();
    const imports = (JSON.parse(json!) as { imports: Record<string, string> })
      .imports;
    expect(imports["react-dom/client"]).toBeDefined();
    expect(imports.react).toMatch(/^\/__react__\/react-[\w-]+\.js$/);
    // Every entry is a file: a prefix entry would point at hashed-name dirs.
    for (const [spec, url] of Object.entries(imports)) {
      expect(spec.endsWith("/"), spec).toBe(false);
      expect(existsSync(join(outDir, url)), `${spec} -> ${url}`).toBe(true);
    }

    // Static servers (nginx) read the dist as another user: the staging
    // dir's mkdtemp 0700 must not reach the served directory.
    const mode = statSync(join(outDir, "__react__")).mode & 0o777;
    expect(mode & 0o005).toBe(0o005);
    const leftover = readdirSync(join(root, "node_modules")).filter((n) =>
      n.startsWith(".ph-react-self-host-"),
    );
    expect(leftover).toEqual([]);
  }, 120_000);
});
