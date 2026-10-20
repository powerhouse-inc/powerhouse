import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { build } from "vite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  phBundledPackagesPlugin,
  RESOLVED_VIRTUAL_ID,
  VIRTUAL_ID,
} from "./ph-bundled-packages.js";

// Inside cwd: Vite 8's build-html rejects an index.html outside it.
const TMP_PARENT = join(process.cwd(), "node_modules");

type Hook = (this: unknown, id: string) => unknown;
function hooks(packages: string[], projectRoot?: string) {
  const plugin = phBundledPackagesPlugin({ packages, projectRoot });
  return {
    resolveId: plugin.resolveId as unknown as Hook,
    load: plugin.load as unknown as Hook,
  };
}

describe("phBundledPackagesPlugin", () => {
  it("resolves the virtual id to a no-op module when there are no local packages", () => {
    const { resolveId, load } = hooks([]);
    expect(resolveId.call({}, VIRTUAL_ID)).toBe(RESOLVED_VIRTUAL_ID);
    expect(resolveId.call({}, "other")).toBeUndefined();
    expect(load.call({}, RESOLVED_VIRTUAL_ID)).toBe(
      "export default () => {};\n",
    );
  });

  it("emits a register module for each local package", () => {
    const { load } = hooks(["@scope/pkg"], "/nonexistent");
    const code = load.call({}, RESOLVED_VIRTUAL_ID) as string;
    expect(code).toContain(`import * as pkg0 from "@scope/pkg";`);
    expect(code).toContain(
      `pm.addLocalPackage("@scope/pkg", pkg0, undefined);`,
    );
  });
});

describe("phBundledPackagesPlugin build", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(TMP_PARENT, ".ph-bundled-packages-e2e-"));
    const pkg = join(root, "node_modules", "local-pkg");
    mkdirSync(pkg, { recursive: true });
    writeFileSync(
      join(pkg, "package.json"),
      JSON.stringify({
        name: "local-pkg",
        version: "1.2.3",
        type: "module",
        exports: { ".": "./index.js", "./style.css": "./style.css" },
      }),
    );
    writeFileSync(
      join(pkg, "index.js"),
      `export const documentModels = ["local/model"];`,
    );
    writeFileSync(join(pkg, "style.css"), `.local-pkg{color:red}`);
    writeFileSync(
      join(root, "index.html"),
      `<!doctype html><html><head></head><body><script type="module" src="/main.js"></script></body></html>`,
    );
    // Same shape as Connect's bootstrap (apps/connect/src/store/reactor.ts).
    writeFileSync(
      join(root, "main.js"),
      `const { default: register } = await import("ph-bundled-packages-virtual");\nregister(globalThis.pm);\n`,
    );
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  async function buildJs(packages: string[]): Promise<string> {
    const outDir = join(root, "dist");
    await build({
      root,
      logLevel: "silent",
      build: { outDir, emptyOutDir: true, minify: false },
      plugins: [phBundledPackagesPlugin({ packages, projectRoot: root })],
    });
    const assets = join(outDir, "assets");
    return readdirSync(assets)
      .filter((f) => f.endsWith(".js"))
      .map((f) => readFileSync(join(assets, f), "utf8"))
      .join("\n");
  }

  it("bundles the register module so local packages are registered", async () => {
    const js = await buildJs(["local-pkg"]);
    expect(js).not.toMatch(
      /import\(\s*["'`]ph-bundled-packages-virtual["'`]\s*\)/,
    );
    expect(js).toContain(`addLocalPackage("local-pkg"`);
    expect(js).toContain("local/model");
  }, 120_000);

  it("bundles a no-op module when there are no local packages", async () => {
    const js = await buildJs([]);
    expect(js).not.toMatch(
      /import\(\s*["'`]ph-bundled-packages-virtual["'`]\s*\)/,
    );
    expect(js).not.toContain("addLocalPackage");
  }, 120_000);

  it("loads a package's offered routes from their own chunk", async () => {
    // `ph build` output; by path, as an unmigrated package doesn't export it.
    const routes = join(root, "node_modules/local-pkg/dist/browser");
    mkdirSync(routes, { recursive: true });
    writeFileSync(
      join(routes, "connect-routes.js"),
      `export const connectRoutes = ["local-route"];`,
    );
    await buildJs(["local-pkg"]);
    const assets = readdirSync(join(root, "dist/assets"));
    const chunk = assets.find((f) => /^connect-routes-.*\.js$/.test(f));
    expect(chunk).toBeDefined();
    expect(readFileSync(join(root, "dist/assets", chunk!), "utf8")).toContain(
      "local-route",
    );
    const entry = assets
      .filter((f) => f !== chunk && f.endsWith(".js"))
      .map((f) => readFileSync(join(root, "dist/assets", f), "utf8"))
      .join("\n");
    expect(entry).toContain(chunk);
    expect(entry).not.toContain("local-route");
  }, 120_000);
});
