import type {
  DefinitionDiagnostic,
  DefinitionSource,
  Sha256Digest,
} from "@powerhousedao/shared/document-model";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { sha256 } from "../../src/definition/kernel/hashes.js";
import { DefinitionSourceLoader } from "../../src/definition/tooling/definition-source-loader.js";
import type {
  LoadedDefinitionSet,
  TypeScriptSourceImportInterface,
} from "../../src/definition/tooling/definition-source-types.js";

const HERE = resolve(fileURLToPath(import.meta.url), "..");
const FIXTURES_ROOT = join(HERE, "fixtures");
const DOCUMENT_MODEL_PACKAGE = resolve(HERE, "..", "..");
const FILE_SEPARATOR = String.fromCharCode(0);

export function materializeFixturePackage(name: string): {
  readonly root: string;
  readonly dispose: () => void;
} {
  // macOS reaches every temp directory through a symlink.
  const root = realpathSync.native(
    mkdtempSync(join(tmpdir(), `ph-definition-sources-${name}-`)),
  );
  cpSync(join(FIXTURES_ROOT, name), root, { recursive: true });
  mkdirSync(join(root, "node_modules"), { recursive: true });
  symlinkSync(
    DOCUMENT_MODEL_PACKAGE,
    join(root, "node_modules", "document-model"),
  );
  // Project scalar modules import zod, as a real package does.
  symlinkSync(
    realpathSync.native(join(DOCUMENT_MODEL_PACKAGE, "node_modules", "zod")),
    join(root, "node_modules", "zod"),
  );
  return {
    root,
    dispose: () => rmSync(root, { recursive: true, force: true }),
  };
}

export function requestedSources(root: string, file: string): unknown[] {
  return JSON.parse(readFileSync(join(root, file), "utf8")) as unknown[];
}

export function packageRevisionOf(root: string): Sha256Digest {
  const parts: string[] = [];
  const walk = (directory: string, prefix: string): void => {
    for (const entry of readdirSync(directory).sort()) {
      if (entry === "node_modules") continue;
      const path = join(directory, entry);
      const relative = prefix === "" ? entry : `${prefix}/${entry}`;
      if (statSync(path).isDirectory()) walk(path, relative);
      else parts.push(`${relative}\n${readFileSync(path, "utf-8")}`);
    }
  };
  walk(root, "");
  return sha256(parts.join(FILE_SEPARATOR));
}

export type ExpectedDefinition = {
  readonly documentType: string;
  readonly version: number;
  readonly source: DefinitionSource;
};

/**
 * Without `sources`, the loader discovers the fixture's model directories.
 * With it, the loader loads the named list (a fixture JSON file holding an
 * array of source entries).
 */
export type LoaderSelection = {
  readonly fixture: string;

  readonly configFile?: string;
  readonly sources?: string;
};

export type LoaderContractCase = LoaderSelection & {
  readonly name: string;
  readonly expected: {
    readonly status: LoadedDefinitionSet["status"];
    readonly origin: "discovery" | "request";
    readonly diagnosticCodes: readonly string[];
    readonly documentModels: readonly ExpectedDefinition[];
    readonly upgradeManifestTypes?: readonly string[];

    readonly imported: readonly string[];
  };
};

const invoice = (
  version: number,
  specifier: `./${string}`,
  exportPath: readonly string[],
): ExpectedDefinition => ({
  documentType: "test/invoice",
  version,
  source: { specifier, exportPath },
});

const FAMILY_WITH_ALIAS = {
  status: "ready",
  origin: "request",
  diagnosticCodes: [],

  documentModels: [
    invoice(1, "./src/catalog.ts", ["publishedInvoice"]),
    invoice(2, "./src/invoice.ts", ["invoiceFamily", "modules", "1"]),
  ],
  upgradeManifestTypes: ["test/invoice"],
  imported: ["./src/catalog.ts", "./src/invoice.ts"],
} as const;

const HEALTHY = {
  documentType: "test/healthy",
  version: 1,
  source: { specifier: "./src/healthy.ts", exportPath: ["healthy"] },
} as const;

const LEDGER = (specifier: `./${string}`, name: string) => ({
  documentType: "test/ledger",
  version: 1,
  source: { specifier, exportPath: [name] },
});

const NOTHING_LOADED = {
  origin: "request",
  documentModels: [],
  imported: [],
} as const;

export const LOADER_CONTRACT_CASES: readonly LoaderContractCase[] = [
  {
    name: "loads a family and folds an alias selected from a second root",
    fixture: "control",
    sources: "control.sources.json",
    expected: FAMILY_WITH_ALIAS,
  },
  {
    name: "produces the same result when the configured entries are reordered",
    fixture: "control",
    sources: "reordered.sources.json",
    expected: FAMILY_WITH_ALIAS,
  },
  {
    name: "imports one module once however many export paths select it",
    fixture: "control",
    sources: "export-paths.sources.json",
    expected: {
      ...FAMILY_WITH_ALIAS,
      documentModels: [
        invoice(1, "./src/invoice.ts", ["invoiceFamily", "modules", "0"]),
        invoice(2, "./src/invoice.ts", ["invoiceFamily", "modules", "1"]),
      ],
      imported: ["./src/invoice.ts"],
    },
  },
  {
    name: "names both positions of a duplicated entry and imports nothing",
    fixture: "control",
    sources: "duplicate.sources.json",
    expected: {
      ...NOTHING_LOADED,
      status: "failed",
      diagnosticCodes: ["PH-CONFIG-DUPLICATE-SOURCE"],
    },
  },
  {
    name: "reports a configured export that the namespace does not have",
    fixture: "control",
    sources: "missing-export.sources.json",
    expected: {
      ...NOTHING_LOADED,
      status: "failed",
      diagnosticCodes: ["PH-CONFIG-SOURCE-INVALID"],
      imported: ["./src/invoice.ts"],
    },
  },
  {
    name: "keeps every diagnostic a thrown DefinitionError carried",
    fixture: "failures",
    sources: "failures.sources.json",
    expected: {
      ...NOTHING_LOADED,
      status: "failed",
      diagnosticCodes: ["PH-DM-STATE-ROOT-INVALID", "PH-DM-STATE-ROOT-INVALID"],
      documentModels: [HEALTHY],
      imported: ["./src/healthy.ts", "./src/structured.ts"],
    },
  },
  {
    name: "reports an ordinary import failure for one source only",
    fixture: "failures",
    sources: "throwing.sources.json",
    expected: {
      ...NOTHING_LOADED,
      status: "failed",
      diagnosticCodes: ["PH-IMPORT-FAILED"],
      documentModels: [HEALTHY],
      imported: ["./src/healthy.ts", "./src/throws.ts"],
    },
  },
  {
    name: "refuses to call a source that exports nothing a silent success",
    fixture: "failures",
    sources: "nothing.sources.json",
    expected: {
      ...NOTHING_LOADED,
      status: "failed",
      diagnosticCodes: ["PH-PKG-DEFINITION-UNRECOGNIZED"],
      imported: ["./src/empty.ts"],
    },
  },
  {
    name: "reports two distinct values claiming one document type and version",
    fixture: "collisions",
    sources: "collisions.sources.json",
    expected: {
      ...NOTHING_LOADED,
      status: "failed",
      diagnosticCodes: ["PH-PKG-LOGICAL-COLLISION"],
      documentModels: [
        LEDGER("./src/first.ts", "ledger"),
        LEDGER("./src/second.ts", "ledgerCopy"),
      ],
      imported: ["./src/first.ts", "./src/second.ts"],
    },
  },
  {
    name: "diagnoses a manifest that claims a version no module publishes",
    fixture: "collisions",
    sources: "manifest.sources.json",
    expected: {
      ...NOTHING_LOADED,
      status: "failed",
      diagnosticCodes: ["PH-DM-DECLARATION-INVALID"],
      documentModels: [LEDGER("./src/manifest-mismatch.ts", "ledger")],
      upgradeManifestTypes: ["test/ledger"],
      imported: ["./src/manifest-mismatch.ts"],
    },
  },
  {
    name: "reports two distinct manifests claiming one document type",
    fixture: "collisions",
    sources: "manifest-collision.sources.json",
    expected: {
      ...NOTHING_LOADED,
      status: "failed",
      diagnosticCodes: ["PH-PKG-LOGICAL-COLLISION"],
      documentModels: [LEDGER("./src/manifest-a.ts", "ledger")],
      upgradeManifestTypes: ["test/ledger", "test/ledger"],
      imported: ["./src/manifest-a.ts", "./src/manifest-b.ts"],
    },
  },
  {
    name: "skips a package whose sources live outside any model directory",
    fixture: "schema-first",
    expected: {
      ...NOTHING_LOADED,
      origin: "discovery",
      status: "skipped",
      diagnosticCodes: [],
    },
  },
  {
    name: "skips a package without a models directory",
    fixture: "configs",
    expected: {
      ...NOTHING_LOADED,
      origin: "discovery",
      status: "skipped",
      diagnosticCodes: [],
    },
  },
  {
    name: "skips an empty requested list",
    fixture: "configs",
    sources: "empty.sources.json",
    expected: { ...NOTHING_LOADED, status: "skipped", diagnosticCodes: [] },
  },
  {
    name: "rejects a specifier that leaves the package root",
    fixture: "configs",
    sources: "outside.sources.json",
    expected: {
      ...NOTHING_LOADED,
      status: "failed",
      diagnosticCodes: ["PH-CONFIG-SOURCE-OUTSIDE-PACKAGE"],
    },
  },
  {
    name: "rejects a malformed entry and a non-relative specifier together",
    fixture: "configs",
    sources: "entry-shape.sources.json",
    expected: {
      ...NOTHING_LOADED,
      status: "failed",
      diagnosticCodes: ["PH-CONFIG-SOURCE-INVALID", "PH-CONFIG-SOURCE-INVALID"],
    },
  },
  {
    name: "fails a config file that is not JSON",
    fixture: "configs",
    configFile: "malformed.config.json.txt",
    expected: {
      ...NOTHING_LOADED,
      origin: "discovery",
      status: "failed",
      diagnosticCodes: ["PH-CONFIG-SOURCE-INVALID"],
    },
  },
  {
    name: "discovers a conventional code-first entry beside a stored model",
    fixture: "mixed",
    expected: {
      status: "ready",
      origin: "discovery",
      diagnosticCodes: [],
      documentModels: [
        {
          documentType: "example/ledger",
          version: 1,
          source: {
            specifier: "./document-models/ledger/index.ts",
            exportPath: ["Ledger"],
          },
        },
      ],
      imported: ["./document-models/ledger/index.ts"],
    },
  },
];

export function countingImporter(
  importer: TypeScriptSourceImportInterface,
): TypeScriptSourceImportInterface & { readonly imported: string[] } {
  const imported: string[] = [];
  return {
    imported,
    importModule(request) {
      imported.push(request.specifier);
      return importer.importModule(request);
    },
    disposeRevision(revision) {
      return importer.disposeRevision?.(revision);
    },
  };
}

export type ContractOutcome = {
  readonly status: LoadedDefinitionSet["status"];
  readonly origin: string;
  readonly diagnosticCodes: readonly string[];
  readonly documentModels: readonly ExpectedDefinition[];
  readonly upgradeManifestTypes: readonly string[];
  readonly imported: readonly string[];
  readonly diagnostics: readonly DefinitionDiagnostic[];
};

export async function runLoaderSelection(
  selection: LoaderSelection,
  createImporter: (packageRoot: string) => TypeScriptSourceImportInterface,
): Promise<ContractOutcome> {
  const fixture = materializeFixturePackage(selection.fixture);
  try {
    const importer = countingImporter(createImporter(fixture.root));
    const loader = new DefinitionSourceLoader(importer);
    const request = {
      configFile: join(
        fixture.root,
        selection.configFile ?? "powerhouse.config.json",
      ),
      packageRevision: packageRevisionOf(fixture.root),
    };
    const result =
      selection.sources === undefined
        ? await loader.normalizeDefinitionSources(request)
        : await loader.normalizeRequestedSources({
            ...request,
            sources: requestedSources(fixture.root, selection.sources),
          });
    await loader.dispose();
    return {
      status: result.status,
      origin: result.sourceSet.origin,
      diagnosticCodes: result.diagnostics.map(({ code }) => code),
      documentModels: result.documentModels.map(({ source, value }) => ({
        documentType: value.documentModel.global.id,
        version: (value as { version?: number }).version ?? 0,
        source,
      })),
      upgradeManifestTypes: result.upgradeManifests.map(
        ({ value }) => value.documentType,
      ),
      imported: [...importer.imported].sort(),
      diagnostics: result.diagnostics,
    };
  } finally {
    fixture.dispose();
  }
}

/** Imports through Node from a copy of the package bound to one revision. */
export function nodeImporter(): TypeScriptSourceImportInterface {
  const roots = new Map<string, string>();
  return {
    importModule: async ({ packageRoot, specifier, packageRevision }) => {
      let root = roots.get(packageRevision);
      if (root === undefined) {
        root = realpathSync.native(mkdtempSync(join(tmpdir(), "ph-revision-")));
        cpSync(packageRoot, root, { recursive: true });
        roots.set(packageRevision, root);
      }
      const url = pathToFileURL(join(root, specifier));
      return (await import(url.href)) as Readonly<Record<string, unknown>>;
    },
    disposeRevision: (revision) => {
      for (const [key, root] of [...roots]) {
        if (revision !== undefined && key !== revision) continue;
        roots.delete(key);
        rmSync(root, { recursive: true, force: true });
      }
    },
  };
}
