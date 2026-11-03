import { DEFAULT_AUTHORING_MODE } from "@powerhousedao/shared/clis/definition-sources";
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
import { fileURLToPath } from "node:url";
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
  return {
    root,
    dispose: () => rmSync(root, { recursive: true, force: true }),
  };
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

export type LoaderSelection = {
  readonly fixture: string;

  readonly configFile?: string;
};

export type LoaderContractCase = LoaderSelection & {
  readonly name: string;
  readonly expected: {
    readonly status: LoadedDefinitionSet["status"];
    readonly mode: "code-first" | "schema-first";
    readonly origin: "config" | "cli";
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
  mode: "code-first",
  origin: "config",
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
  mode: "code-first",
  origin: "config",
  documentModels: [],
  imported: [],
} as const;

export const LOADER_CONTRACT_CASES: readonly LoaderContractCase[] = [
  {
    name: "loads a family and folds an alias selected from a second root",
    fixture: "control",
    expected: FAMILY_WITH_ALIAS,
  },
  {
    name: "produces the same result when the configured entries are reordered",
    fixture: "control",
    configFile: "reordered.config.json",
    expected: FAMILY_WITH_ALIAS,
  },
  {
    name: "imports one module once however many export paths select it",
    fixture: "control",
    configFile: "export-paths.config.json",
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
    configFile: "duplicate.config.json",
    expected: {
      ...NOTHING_LOADED,
      status: "failed",
      diagnosticCodes: ["PH-CONFIG-DUPLICATE-SOURCE"],
    },
  },
  {
    name: "reports a configured export that the namespace does not have",
    fixture: "control",
    configFile: "missing-export.config.json",
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
    configFile: "throwing.config.json",
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
    configFile: "nothing.config.json",
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
    configFile: "manifest.config.json",
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
    configFile: "manifest-collision.config.json",
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
    name: "skips an explicit schema-first package without importing anything",
    fixture: "schema-first",
    expected: {
      ...NOTHING_LOADED,
      status: "skipped",
      mode: "schema-first",
      diagnosticCodes: [],
    },
  },
  {
    name: "skips absent definitionSources using the shared default",
    fixture: "configs",
    expected: {
      ...NOTHING_LOADED,
      status: "skipped",
      mode: DEFAULT_AUTHORING_MODE,
      diagnosticCodes: [],
    },
  },
  {
    name: "skips an empty code-first list",
    fixture: "configs",
    configFile: "empty.config.json",
    expected: { ...NOTHING_LOADED, status: "skipped", diagnosticCodes: [] },
  },
  {
    name: "fails a format version this release does not read",
    fixture: "configs",
    configFile: "unsupported.config.json",
    expected: {
      ...NOTHING_LOADED,
      status: "failed",
      diagnosticCodes: ["PH-CONFIG-VERSION-UNSUPPORTED"],
    },
  },
  {
    name: "rejects a specifier that leaves the package root",
    fixture: "configs",
    configFile: "outside.config.json",
    expected: {
      ...NOTHING_LOADED,
      status: "failed",
      diagnosticCodes: ["PH-CONFIG-SOURCE-OUTSIDE-PACKAGE"],
    },
  },
  {
    name: "rejects a malformed entry and a non-relative specifier together",
    fixture: "configs",
    configFile: "entry-shape.config.json",
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
      status: "failed",
      diagnosticCodes: ["PH-CONFIG-SOURCE-INVALID"],
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
  readonly mode: string;
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
    const result = await loader.normalizeDefinitionSources({
      configFile: join(
        fixture.root,
        selection.configFile ?? "powerhouse.config.json",
      ),
      packageRevision: packageRevisionOf(fixture.root),
    });
    await loader.dispose();
    return {
      status: result.status,
      mode: result.sourceSet.mode,
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
