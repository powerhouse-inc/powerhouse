import { buildTsMorphProject } from "@powerhousedao/codegen/utils";
import { extractProcessorDocuments } from "@powerhousedao/vetra/codegen";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
import { startGenerateApp } from "../src/services/generate-app.js";
import { startGenerateDocumentModel } from "../src/services/generate-document-model.js";
import { startGenerateEditor } from "../src/services/generate-editor.js";
import { startGeneratePiece } from "../src/services/generate-piece.js";
import { startGenerateProcessor } from "../src/services/generate-processor.js";
import { startGenerateSubgraph } from "../src/services/generate-subgraph.js";
import type { GeneratePieceArgs } from "../src/types.js";

const SUBGRAPH_MODULE_SPEC = join(
  import.meta.dirname,
  "../../../packages/vetra/document-models/subgraph-module/subgraph-module.json",
);
const originalCwd = process.cwd();
let base: string;
let root: string;
let logged: string[];
let warned: string[];

const common = { document: undefined, dir: undefined, debug: undefined };
const editorArgs = (overrides: object) => ({
  ...common,
  name: undefined,
  documentType: undefined,
  all: false,
  extract: false,
  ...overrides,
});
const processorArgs = (overrides: object) => ({
  ...common,
  name: undefined,
  type: "analytics" as const,
  documentTypes: [],
  apps: ["switchboard" as const, "connect" as const],
  all: false,
  extract: false,
  skipInstall: true,
  ...overrides,
});
const documentModelArgs = (overrides: object) => ({
  ...common,
  all: false,
  extract: false,
  ...overrides,
});
const pieceArgs = (
  overrides: Partial<GeneratePieceArgs>,
): GeneratePieceArgs => ({
  namePositional: undefined,
  name: undefined,
  id: undefined,
  auth: "custom",
  description: undefined,
  dir: undefined,
  all: false,
  skipInstall: true,
  debug: undefined,
  ...overrides,
});
const subgraphArgs = (overrides: object) => ({
  ...common,
  name: undefined,
  all: false,
  extract: false,
  skipInstall: true,
  ...overrides,
});

function readManifest() {
  return JSON.parse(
    readFileSync(join(root, "powerhouse.manifest.json"), "utf8"),
  ) as Record<
    "documentModels" | "editors" | "pieces" | "processors" | "subgraphs",
    { id: string }[]
  >;
}
const ids = (kind: "documentModels" | "editors" | "processors" | "subgraphs") =>
  readManifest()[kind].map((entry) => entry.id);

// Scaffolds once: a document model, an editor for it, a processor and a subgraph.
beforeAll(async () => {
  base = realpathSync(mkdtempSync(join(tmpdir(), "ph-generate-modules-")));
  writeFileSync(
    join(base, "package.json"),
    JSON.stringify(
      {
        name: "@acme/stockroom",
        type: "module",
        devDependencies: { "document-model": "6.0.0" },
        peerDependencies: { "document-model": "6.0.0" },
      },
      null,
      2,
    ),
  );
  writeFileSync(
    join(base, "tsconfig.json"),
    JSON.stringify({ compilerOptions: { module: "nodenext" } }, null, 2),
  );
  vi.spyOn(console, "log").mockImplementation(() => {});
  await startGenerateDocumentModel(
    documentModelArgs({ document: SUBGRAPH_MODULE_SPEC }),
    base,
  );
  await startGenerateEditor(
    editorArgs({
      name: "Subgraph Editor",
      documentType: "powerhouse/subgraph",
    }),
    base,
  );
  await startGenerateProcessor(
    processorArgs({
      name: "Stock Indexer",
      type: "relationalDb",
      documentTypes: ["powerhouse/subgraph"],
    }),
    base,
  );
  await startGenerateSubgraph(subgraphArgs({ name: "Stock" }), base);
  await startGeneratePiece(pieceArgs({ namePositional: "Stock Feed" }), base);
  vi.restoreAllMocks();
  process.chdir(originalCwd);
}, 120_000);

afterAll(() => {
  rmSync(base, { recursive: true, force: true });
});

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), "ph-generate-modules-")));
  cpSync(base, root, { recursive: true });
  logged = [];
  warned = [];
  vi.spyOn(console, "log").mockImplementation((line: string) => {
    logged.push(line);
  });
  vi.spyOn(console, "warn").mockImplementation((line: string) => {
    warned.push(line);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  process.chdir(originalCwd);
  rmSync(root, { recursive: true, force: true });
});

describe("ph-cli generate document-model", () => {
  it("--all keeps the manifest's document models", async () => {
    await startGenerateDocumentModel(documentModelArgs({ all: true }), root);

    expect(ids("documentModels")).toEqual(["powerhouse/subgraph"]);
    expect(logged).toContain('Regenerated document model "Subgraph Module"');
  });

  it("--all keeps the manifest's document models when a spec can't be parsed", async () => {
    writeFileSync(
      join(root, "document-models/subgraph-module/subgraph-module.json"),
      JSON.stringify({ id: 1 }),
    );
    vi.spyOn(console, "error").mockImplementation(() => {});

    await startGenerateDocumentModel(documentModelArgs({ all: true }), root);

    expect(ids("documentModels")).toEqual(["powerhouse/subgraph"]);
    expect(warned).toEqual([
      expect.stringContaining("Skipped document-models/subgraph-module"),
    ]);
    expect(logged).not.toContain(
      "No document models found in document-models/.",
    );
  });

  it("--all keeps the manifest's document models when a directory has no spec", async () => {
    mkdirSync(join(root, "document-models/half-model"));

    await startGenerateDocumentModel(documentModelArgs({ all: true }), root);

    expect(ids("documentModels")).toEqual(["powerhouse/subgraph"]);
    expect(warned).toEqual([
      expect.stringContaining("Skipped document-models/half-model"),
    ]);
  });

  it("--all drops the entry of a document model whose directory is gone", async () => {
    rmSync(join(root, "document-models/subgraph-module"), { recursive: true });

    await startGenerateDocumentModel(documentModelArgs({ all: true }), root);

    expect(ids("documentModels")).toEqual([]);
    expect(logged).toEqual(["No document models found in document-models/."]);
  });

  it.each([
    "subgraph-module",
    "document-models/subgraph-module",
    "document-models/subgraph-module/subgraph-module.json",
  ])("--dir %s regenerates the document model", async (dir) => {
    await startGenerateDocumentModel(documentModelArgs({ dir }), root);

    expect(logged).toContain(
      'Regenerated document model "Subgraph Module" in document-models/subgraph-module',
    );
  });

  it("--dir says what it expects", async () => {
    await expect(
      startGenerateDocumentModel(
        documentModelArgs({ dir: "missing-model" }),
        root,
      ),
    ).rejects.toThrow(
      'No directory in document-models/ for --dir "missing-model": expected its name ("my-document-model") or its path ("document-models/my-document-model").',
    );
  });

  it("--dir says when the spec file is missing", async () => {
    rmSync(join(root, "document-models/subgraph-module/subgraph-module.json"));

    await expect(
      startGenerateDocumentModel(
        documentModelArgs({ dir: "subgraph-module" }),
        root,
      ),
    ).rejects.toThrow(
      "document-models/subgraph-module has no subgraph-module.json.",
    );
  });
});

describe("ph-cli generate piece", () => {
  it.each(["stock-feed", "pieces/stock-feed", "pieces/stock-feed/index.ts"])(
    "--dir %s re-registers the piece",
    async (dir) => {
      await startGeneratePiece(pieceArgs({ dir }), root);

      expect(logged).toContain("Re-registered the piece in pieces/stock-feed");
      expect(readManifest().pieces.map((piece) => piece.id)).toEqual([
        "@acme/piece-stock-feed",
      ]);
    },
  );

  it("--dir rejects the pieces folder itself", async () => {
    await expect(
      startGeneratePiece(pieceArgs({ dir: "pieces" }), root),
    ).rejects.toThrow(
      'No directory in pieces/ for --dir "pieces": expected its name ("my-piece") or its path ("pieces/my-piece").',
    );
  });
});

describe("ph-cli generate editor", () => {
  it("--all keeps the manifest's editors", async () => {
    await startGenerateEditor(editorArgs({ all: true }), root);

    expect(ids("editors")).toEqual(["subgraph-editor"]);
    expect(logged).toEqual([
      'Regenerated editor "Subgraph Editor" in editors/subgraph-editor',
    ]);
  });

  it("--all keeps the manifest's editors when a module.ts can't be read", async () => {
    writeFileSync(
      join(root, "editors", "subgraph-editor", "module.ts"),
      'const id = "subgraph-editor";\nexport const SubgraphEditor = { config: { id } };\n',
    );

    await startGenerateEditor(editorArgs({ all: true }), root);

    expect(ids("editors")).toEqual(["subgraph-editor"]);
    expect(warned).toEqual([
      expect.stringContaining("Skipped editors/subgraph-editor"),
    ]);
  });

  it.each([
    "subgraph-editor",
    "editors/subgraph-editor",
    "editors/subgraph-editor/module.ts",
  ])("--dir %s regenerates the editor", async (dir) => {
    await startGenerateEditor(editorArgs({ dir }), root);

    expect(logged).toEqual([
      'Regenerated editor "Subgraph Editor" in editors/subgraph-editor',
    ]);
  });

  it("--dir says what it expects", async () => {
    await expect(
      startGenerateEditor(editorArgs({ dir: "missing-editor" }), root),
    ).rejects.toThrow(
      'No directory in editors/ for --dir "missing-editor": expected its name ("my-editor") or its path ("editors/my-editor").',
    );
  });

  it("--dir rejects a drive app", async () => {
    await startGenerateApp(
      {
        ...common,
        name: "Stockroom App",
        allowedDocumentTypes: undefined,
        disableDragAndDrop: false,
        all: false,
        extract: false,
      },
      root,
    );

    await expect(
      startGenerateEditor(editorArgs({ dir: "stockroom-app" }), root),
    ).rejects.toThrow(
      "editors/stockroom-app is a drive app, not a document editor",
    );
  });

  it("--extract writes a spec for the editor", async () => {
    await startGenerateEditor(editorArgs({ extract: true }), root);

    const specPath = join(root, "specs/editors/subgraph-editor.editor.phd");
    expect(logged).toEqual([`Wrote ${specPath}`]);
    expect(existsSync(specPath)).toBe(true);
  });
});

describe("ph-cli generate processor", () => {
  it("--all keeps the manifest's processors", async () => {
    await startGenerateProcessor(processorArgs({ all: true }), root);

    expect(ids("processors")).toEqual(["stock-indexer"]);
    expect(logged).toEqual([
      "Regenerated processor in processors/stock-indexer",
    ]);
  });

  it.each([
    "stock-indexer",
    "processors/stock-indexer",
    "processors/stock-indexer/factory.ts",
  ])("--dir %s regenerates the processor in place", async (dir) => {
    await startGenerateProcessor(processorArgs({ dir }), root);

    expect(logged).toEqual([
      "Regenerated processor in processors/stock-indexer",
    ]);
    expect(ids("processors")).toEqual(["stock-indexer"]);
    expect(readFileSync(join(root, "processors/switchboard.ts"), "utf8")).toBe(
      readFileSync(join(base, "processors/switchboard.ts"), "utf8"),
    );
  });

  it("--dir says what it expects", async () => {
    await expect(
      startGenerateProcessor(processorArgs({ dir: "processors" }), root),
    ).rejects.toThrow(
      'No directory in processors/ for --dir "processors": expected its name ("my-processor") or its path ("processors/my-processor").',
    );
  });

  it("--extract writes a spec with the processor's type and document types", async () => {
    await startGenerateProcessor(processorArgs({ extract: true }), root);

    const specPath = join(root, "specs/processors/stock-indexer.processor.phd");
    expect(logged).toEqual([`Wrote ${specPath}`]);
    expect(existsSync(specPath)).toBe(true);
    const [doc] = extractProcessorDocuments(buildTsMorphProject(root));
    expect(doc.state.global).toMatchObject({
      name: "stock-indexer",
      type: "relational",
      documentTypes: [
        expect.objectContaining({ documentType: "powerhouse/subgraph" }),
      ],
    });
  });
});

describe("ph-cli generate subgraph", () => {
  it("adds reactor-api, which the subgraph imports, to package.json", () => {
    const manifest = JSON.parse(
      readFileSync(join(root, "package.json"), "utf8"),
    ) as Record<"peerDependencies" | "devDependencies", Record<string, string>>;

    expect(manifest.peerDependencies["@powerhousedao/reactor-api"]).toBe(
      "6.0.0",
    );
    expect(manifest.devDependencies["@powerhousedao/reactor-api"]).toBe(
      "6.0.0",
    );
  });

  it("--all keeps the manifest's subgraphs", async () => {
    await startGenerateSubgraph(subgraphArgs({ all: true }), root);

    expect(ids("subgraphs")).toEqual(["stock"]);
    expect(logged).toEqual(['Regenerated subgraph "stock"']);
  });

  it("--all keeps the manifest's subgraphs when an index.ts can't be read", async () => {
    writeFileSync(
      join(root, "subgraphs", "stock", "index.ts"),
      "export class StockSubgraph {}\n",
    );

    await startGenerateSubgraph(subgraphArgs({ all: true }), root);

    expect(ids("subgraphs")).toEqual(["stock"]);
    expect(warned).toEqual([
      expect.stringContaining("Skipped subgraphs/stock"),
    ]);
  });

  it.each(["stock", "subgraphs/stock"])(
    "--dir %s regenerates the subgraph",
    async (dir) => {
      await startGenerateSubgraph(subgraphArgs({ dir }), root);

      expect(logged).toEqual(['Regenerated subgraph "stock"']);
    },
  );

  it("--dir says what it can't read", async () => {
    writeFileSync(
      join(root, "subgraphs", "stock", "index.ts"),
      "export class StockSubgraph {}\n",
    );

    await expect(
      startGenerateSubgraph(subgraphArgs({ dir: "stock" }), root),
    ).rejects.toThrow(
      "Could not read subgraphs/stock/index.ts: expected a class extending BaseSubgraph with a string literal `name`.",
    );
  });

  it("refuses a name a document model's subgraph has", async () => {
    await expect(
      startGenerateSubgraph(subgraphArgs({ name: "Subgraph Module" }), root),
    ).rejects.toThrow(
      'Subgraph name "subgraph-module" is taken by a document model subgraph',
    );
    expect(existsSync(join(root, "subgraphs", "subgraph-module"))).toBe(false);
  });

  it("--extract writes a spec for the subgraph", async () => {
    await startGenerateSubgraph(subgraphArgs({ extract: true }), root);

    const specPath = join(root, "specs/subgraphs/stock.subgraph.phd");
    expect(logged).toEqual([`Wrote ${specPath}`]);
    expect(existsSync(specPath)).toBe(true);
  });
});
