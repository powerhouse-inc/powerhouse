// Pieces discovered from installed reactor packages: what the registry accepts,
// what it refuses, and what it tells an operator when a package is half-built.
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PieceRegistry, configuredPackages } from "./piece-registry.js";

let root = "";

// A package root as it looks once its build has run: an ESM manifest under
// dist/pieces, and one bundle directory per piece in npm shape.
async function writeManifest(declared: unknown[]): Promise<void> {
  await mkdir(join(root, "dist", "pieces"), { recursive: true });
  await writeFile(
    join(root, "dist", "pieces", "index.mjs"),
    `export const pieces = ${JSON.stringify(declared, null, 2)};\n`,
  );
}

async function writeBundle(dir: string, name: string): Promise<void> {
  const full = join(root, dir);
  await mkdir(join(full, "src"), { recursive: true });
  await writeFile(
    join(full, "package.json"),
    JSON.stringify({ name, version: "1.0.0", main: "./src/index.js" }),
  );
  await writeFile(join(full, "src", "index.js"), "module.exports = {};\n");
}

describe("PieceRegistry", () => {
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "piece-registry-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("finds a piece a package ships and pins its installed version", async () => {
    await writeManifest([
      {
        name: "@powerhousedao/piece-reactor",
        version: "1.2.3",
        bundle: "dist/pieces/reactor",
      },
    ]);
    await writeBundle("dist/pieces/reactor", "@powerhousedao/piece-reactor");

    const registry = new PieceRegistry();
    await registry.load(root);

    const piece = registry.lookup("@powerhousedao/piece-reactor");
    expect(piece?.bundleDir).toBe(join(root, "dist", "pieces", "reactor"));
    expect(piece?.entryPath).toBeUndefined();
    // What an unversioned block type resolves against.
    expect(registry.versions()).toEqual({
      "@powerhousedao/piece-reactor": "1.2.3",
    });
  });

  it("takes a single module file as an entry", async () => {
    await mkdir(join(root, "dist", "pieces"), { recursive: true });
    await writeFile(join(root, "dist", "pieces", "solo.js"), "module.exports={};\n");
    await writeManifest([
      { name: "@acme/piece-solo", version: "0.1.0", entry: "dist/pieces/solo.js" },
    ]);

    const registry = new PieceRegistry();
    await registry.load(root);

    expect(registry.lookup("@acme/piece-solo")?.entryPath).toBe(
      join(root, "dist", "pieces", "solo.js"),
    );
  });

  it("skips a piece whose bundle was never built", async () => {
    await writeManifest([
      { name: "@acme/piece-ghost", version: "1.0.0", bundle: "dist/pieces/ghost" },
    ]);

    const registry = new PieceRegistry();
    await registry.load(root);

    expect(registry.lookup("@acme/piece-ghost")).toBeUndefined();
    expect(registry.entries()).toEqual([]);
  });

  it("is empty for a package that ships no pieces", async () => {
    const registry = new PieceRegistry();
    await registry.load(root);

    expect(registry.entries()).toEqual([]);
    expect(registry.versions()).toEqual({});
  });

  it("loads once however many callers ask", async () => {
    await writeManifest([
      { name: "@acme/piece-one", version: "1.0.0", bundle: "dist/pieces/one" },
    ]);
    await writeBundle("dist/pieces/one", "@acme/piece-one");

    const registry = new PieceRegistry();
    await Promise.all([
      registry.ready(root),
      registry.ready(root),
      registry.ready(root),
    ]);

    expect(registry.entries()).toHaveLength(1);
  });

  it("reads the configured package names, and tolerates no config", async () => {
    expect(configuredPackages(root)).toEqual([]);
    await writeFile(
      join(root, "powerhouse.config.json"),
      JSON.stringify({
        packages: [{ packageName: "@acme/reactor-pack" }, { notAName: true }],
      }),
    );

    expect(configuredPackages(root)).toEqual(["@acme/reactor-pack"]);
  });
});
