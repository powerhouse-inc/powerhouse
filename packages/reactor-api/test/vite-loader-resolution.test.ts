// Where the dev loader finds a package's modules: the project first, then the
// host's own dependencies; a module a package lacks is a quiet miss.
import { packageJsonExports } from "@powerhousedao/shared/clis/constants";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { ViteDevServer } from "vite";
import type { MockInstance } from "vitest";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  VitePackageLoader,
  createViteLogger,
  startViteServer,
} from "../src/packages/vite-loader.mjs";
import { ConsoleLogger } from "document-model";

const PROJECT = "@acme/dev-project";
const HOSTED = "@acme/hosted";
const BROKEN = "@acme/broken";

let base = "";
let root = "";
let hostEntry = "";
let hostedRoot = "";
let vite: ViteDevServer;

async function write(file: string, contents: string): Promise<void> {
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, contents);
}

// A built package installed beside the host, not in the project.
async function writeHostedPackage(
  name: string,
  exports: Record<string, unknown>,
  files: Record<string, string>,
): Promise<string> {
  const dir = join(base, "host", "node_modules", ...name.split("/"));
  await write(
    join(dir, "package.json"),
    JSON.stringify({ name, version: "2.0.0", type: "module", exports }),
  );
  for (const [file, contents] of Object.entries(files)) {
    await write(join(dir, file), contents);
  }
  return dir;
}

type ConsoleFn = (...args: unknown[]) => void;
let errorSpy: MockInstance<ConsoleFn>;
let warnSpy: MockInstance<ConsoleFn>;

const logged = (spy: MockInstance<ConsoleFn>): string =>
  spy.mock.calls.map((call) => call.map(String).join(" ")).join("\n");

describe("VitePackageLoader resolution", () => {
  beforeAll(async () => {
    base = await realpath(await mkdtemp(join(tmpdir(), "vite-loader-res-")));
    root = join(base, "project");

    // A fresh project: every module kind exported, only document models written.
    await write(
      join(root, "package.json"),
      JSON.stringify({
        name: PROJECT,
        version: "1.0.0",
        type: "module",
        exports: packageJsonExports,
      }),
    );
    await write(
      join(root, "document-models", "index.ts"),
      'export const Local = { documentModel: { global: { id: "acme/local" } } };\n',
    );

    hostEntry = join(base, "host", "entry.mjs");
    await write(hostEntry, "export {};\n");

    // No subgraphs or processors export, and no upgrade-manifests directory.
    hostedRoot = await writeHostedPackage(
      HOSTED,
      {
        "./document-models": { node: "./dist/document-models/index.mjs" },
        "./document-models/*": { node: "./dist/document-models/*/index.mjs" },
        "./pieces": { node: "./dist/node/pieces/index.mjs" },
      },
      {
        "dist/document-models/index.mjs":
          'export const Hosted = { documentModel: { global: { id: "acme/hosted" } } };\n',
        "dist/node/pieces/index.mjs":
          'export const pieces = [{ name: "@acme/piece-hosted", entry: "dist/node/pieces/hosted/index.mjs" }];\n',
        "dist/node/pieces/hosted/index.mjs": "export const piece = {};\n",
      },
    );
    await writeHostedPackage(
      BROKEN,
      { "./document-models": { node: "./dist/document-models.mjs" } },
      { "dist/document-models.mjs": 'throw new Error("boom in broken");\n' },
    );

    vite = await startViteServer(root, createViteLogger(new ConsoleLogger()));
  }, 60_000);

  afterAll(async () => {
    await vite.close();
    await rm(base, { recursive: true, force: true });
  });

  beforeEach(() => {
    errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {}) as unknown as MockInstance<ConsoleFn>;
    warnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => {}) as unknown as MockInstance<ConsoleFn>;
  });

  afterEach(() => {
    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it("loads a package the project does not install from the host's dependencies", async () => {
    const loader = VitePackageLoader.build(vite, { resolveFrom: [hostEntry] });

    const models = await loader.loadDocumentModels(HOSTED, true);
    expect(models.map((dm) => dm.documentModel.global.id)).toEqual([
      "acme/hosted",
    ]);
    expect(await loader.loadPieces(HOSTED)).toEqual([
      {
        name: "@acme/piece-hosted",
        version: "2.0.0",
        entryPath: join(hostedRoot, "dist/node/pieces/hosted/index.mjs"),
      },
    ]);
    expect(logged(errorSpy)).toBe("");
  });

  it("finds nothing for that package without the host's location", async () => {
    const loader = VitePackageLoader.build(vite);

    expect(await loader.loadDocumentModels(HOSTED, true)).toEqual([]);
    expect(await loader.loadPieces(HOSTED)).toEqual([]);
    expect(logged(errorSpy)).toBe("");
  });

  it("is quiet about modules a package does not export or ship", async () => {
    const loader = VitePackageLoader.build(vite, { resolveFrom: [hostEntry] });

    expect(await loader.loadSubgraphs(HOSTED)).toEqual([]);
    expect(await loader.loadProcessors(HOSTED)).toBeNull();
    expect(await loader.loadUpgradeManifests(HOSTED)).toEqual([]);
    expect(logged(errorSpy)).toBe("");
    expect(logged(warnSpy)).toBe("");
  });

  it("is quiet about a fresh project's exported but absent modules", async () => {
    const loader = VitePackageLoader.build(vite);

    const models = await loader.loadDocumentModels(root, true);
    expect(models.map((dm) => dm.documentModel.global.id)).toEqual([
      "acme/local",
    ]);
    expect(await loader.loadPieces(root)).toEqual([]);
    expect(await loader.loadPieces(PROJECT)).toEqual([]);
    expect(await loader.loadSubgraphs(root)).toEqual([]);
    expect(await loader.loadProcessors(root)).toBeNull();
    expect(logged(errorSpy)).toBe("");
    expect(logged(warnSpy)).toBe("");
  });

  it("reports a module that exists and fails to load", async () => {
    const loader = VitePackageLoader.build(vite, { resolveFrom: [hostEntry] });

    expect(await loader.loadDocumentModels(BROKEN, true)).toEqual([]);
    const errors = logged(errorSpy);
    expect(errors).toContain(BROKEN);
    expect(errors).toContain("boom in broken");
  });
});
