// The dev loader's half of the piece contract: it reads the TypeScript list a
// project has not built yet, and reloads when the build output changes.
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ViteDevServer } from "vite";
import {
  VitePackageLoader,
  startViteServer,
} from "../src/packages/vite-loader.mjs";

const PACKAGE = "@acme/dev-project";
const PIECE = "@acme/piece-greeter";

let root = "";
let vite: ViteDevServer;
let loader: VitePackageLoader;

// The source list a project edits, naming build output that may not exist yet.
async function writeSourceList(entries: string[]): Promise<void> {
  await mkdir(join(root, "pieces"), { recursive: true });
  await writeFile(
    join(root, "pieces", "index.ts"),
    `export const pieces = [\n${entries.join(",\n")}\n];\n`,
  );
}

function declared(name: string, dir: string): string {
  return `  { name: "${name}", version: "1.0.0", entry: "dist/node/pieces/${dir}/index.mjs" }`;
}

async function writeBuiltPiece(dir: string): Promise<void> {
  const built = join(root, "dist", "node", "pieces", dir);
  await mkdir(built, { recursive: true });
  await writeFile(join(built, "index.mjs"), "export const piece = {};\n");
}

describe("VitePackageLoader.loadPieces", () => {
  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), "vite-loader-pieces-"));
    await writeFile(
      join(root, "package.json"),
      JSON.stringify({ name: PACKAGE, version: "1.0.0", type: "module" }),
    );
    await writeSourceList([declared(PIECE, "greeter")]);
    await writeBuiltPiece("greeter");
    vite = await startViteServer(root);
    loader = VitePackageLoader.build(vite);
  }, 60_000);

  afterAll(async () => {
    await vite.close();
    await rm(root, { recursive: true, force: true });
  });

  it("locates a piece from the source list, against the package root", async () => {
    expect(await loader.loadPieces(root)).toEqual([
      {
        name: PIECE,
        version: "1.0.0",
        entryPath: join(root, "dist", "node", "pieces", "greeter", "index.mjs"),
      },
    ]);
  });

  it("finds the project by its own package name, through the dev alias", async () => {
    expect(await loader.loadPieces(PACKAGE)).toEqual([
      {
        name: PIECE,
        version: "1.0.0",
        entryPath: join(root, "dist", "node", "pieces", "greeter", "index.mjs"),
      },
    ]);
  });

  it("reloads when a piece is built while the reactor runs", async () => {
    // The manager re-reads on its own debounce rather than taking the payload,
    // so what this proves is that the change is reported and the re-read sees it.
    let reported = 0;
    const unsubscribe = loader.onPiecesChange(root, () => {
      reported += 1;
    });

    try {
      // A second piece, built and then declared: neither half alone is enough
      // for the runtime to run it, so the re-read has to see both.
      await writeBuiltPiece("late");
      await writeSourceList([
        declared(PIECE, "greeter"),
        declared("@acme/piece-late", "late"),
      ]);

      await expect
        .poll(
          async () =>
            (await loader.loadPieces(root)).map((piece) => piece.name),
          { timeout: 15_000 },
        )
        .toEqual([PIECE, "@acme/piece-late"]);
      expect(reported).toBeGreaterThan(0);
    } finally {
      unsubscribe();
    }
  }, 40_000);
});
