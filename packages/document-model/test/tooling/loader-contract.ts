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
import { DefinitionSourceLoader } from "../../src/definition/tooling/definition-source-loader.js";
import type {
  LoadedDefinitionSet,
  TypeScriptSourceImportInterface,
} from "../../src/definition/tooling/definition-source-types.js";
import { sha256 } from "../../src/definition/primitives.js";

/**
 * One list of cases, run by every import adapter.
 *
 * The whole point of the import seam is that a check run interactively and a
 * check run inside a build see the same definitions. That only holds if the
 * adapters are measured against the same cases, so the cases live here rather
 * than inside any one suite, and they assert codes, sources, and the
 * definitions found — never a message, which each adapter is free to word its
 * own way.
 */

const HERE = resolve(fileURLToPath(import.meta.url), "..");

const FIXTURES_ROOT = join(HERE, "fixtures");

const COMPILER_PACKAGE = resolve(HERE, "..", "..");

/** Separates one file's bytes from the next inside a package revision. */
const FILE_SEPARATOR = String.fromCharCode(0);

/**
 * Copies a fixture package somewhere writable and makes `document-model`
 * resolvable from inside it.
 *
 * The fixtures import the compiler by its published name, which is what a real
 * package does and what lets an adapter that imports emitted JavaScript run
 * the same bytes as one that imports TypeScript.
 */
export function materializeFixturePackage(name: string): {
  readonly root: string;
  readonly dispose: () => void;
} {
  // The real path: on macOS every temp directory is reached through a
  // symlink, and a package root spelled two ways evaluates its modules twice.
  const root = realpathSync.native(
    mkdtempSync(join(tmpdir(), `ph-definition-sources-${name}-`)),
  );
  cpSync(join(FIXTURES_ROOT, name), root, { recursive: true });
  mkdirSync(join(root, "node_modules", ".bin"), { recursive: true });
  symlinkSync(COMPILER_PACKAGE, join(root, "node_modules", "document-model"));
  // A package scalar's validator is a Zod schema the package writes itself,
  // against the zod it declares as a peer of the compiler.
  symlinkSync(
    join(COMPILER_PACKAGE, "node_modules", "zod"),
    join(root, "node_modules", "zod"),
  );
  // A real package has its compiler installed locally; a fixture that did not
  // would send `npx tsc` to the network.
  const repositoryModules = resolve(
    COMPILER_PACKAGE,
    "..",
    "..",
    "node_modules",
  );
  symlinkSync(
    join(repositoryModules, "typescript"),
    join(root, "node_modules", "typescript"),
  );
  symlinkSync(
    join(repositoryModules, ".bin", "tsc"),
    join(root, "node_modules", ".bin", "tsc"),
  );
  return {
    root,
    dispose: () => rmSync(root, { recursive: true, force: true }),
  };
}

/** Every byte under the package root that a load could depend on. */
export function packageRevisionOf(root: string): Sha256Digest {
  const parts: string[] = [];
  const walk = (directory: string, prefix: string): void => {
    for (const entry of readdirSync(directory).sort()) {
      if (entry === "node_modules") continue;
      const path = join(directory, entry);
      const relative = prefix === "" ? entry : `${prefix}/${entry}`;
      if (statSync(path).isDirectory()) {
        walk(path, relative);
        continue;
      }
      parts.push(`${relative}\n${readFileSync(path, "utf-8")}`);
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
  /** Package-relative config file; the default selects `powerhouse.config.json`. */
  readonly configFile?: string;
  readonly cliSources?: readonly string[];
};

export type LoaderContractCase = LoaderSelection & {
  readonly name: string;
  readonly expected: {
    readonly status: LoadedDefinitionSet["status"];
    readonly mode: "code-first" | "schema-first";
    readonly origin: "config" | "cli";
    /** Every diagnostic code the run must report, sorted, with no others. */
    readonly diagnosticCodes: readonly string[];
    readonly documentModels: readonly ExpectedDefinition[];
    readonly upgradeManifestTypes?: readonly string[];
    /** Modules the adapter must be asked to import, sorted. */
    readonly imported: readonly string[];
  };
};

export const LOADER_CONTRACT_CASES: readonly LoaderContractCase[] = [
  {
    name: "loads a family and folds an alias selected from a second root",
    fixture: "control",
    expected: {
      status: "ready",
      mode: "code-first",
      origin: "config",
      diagnosticCodes: [],
      documentModels: [
        // The alias is reached first in resolved order, so it owns the entry:
        // one definition, reported at one stable coordinate whatever order the
        // config happened to list.
        {
          documentType: "test/invoice",
          version: 1,
          source: {
            specifier: "./src/catalog.ts",
            exportPath: ["publishedInvoice"],
          },
        },
        {
          documentType: "test/invoice",
          version: 2,
          source: {
            specifier: "./src/invoice.ts",
            exportPath: ["invoiceFamily", "modules", "1"],
          },
        },
      ],
      upgradeManifestTypes: ["test/invoice"],
      imported: ["./src/catalog.ts", "./src/invoice.ts"],
    },
  },
  {
    name: "produces the same result when the configured entries are reordered",
    fixture: "control",
    configFile: "reordered.config.json",
    expected: {
      status: "ready",
      mode: "code-first",
      origin: "config",
      diagnosticCodes: [],
      documentModels: [
        // The alias is reached first in resolved order, so it owns the entry:
        // one definition, reported at one stable coordinate whatever order the
        // config happened to list.
        {
          documentType: "test/invoice",
          version: 1,
          source: {
            specifier: "./src/catalog.ts",
            exportPath: ["publishedInvoice"],
          },
        },
        {
          documentType: "test/invoice",
          version: 2,
          source: {
            specifier: "./src/invoice.ts",
            exportPath: ["invoiceFamily", "modules", "1"],
          },
        },
      ],
      upgradeManifestTypes: ["test/invoice"],
      imported: ["./src/catalog.ts", "./src/invoice.ts"],
    },
  },
  {
    name: "imports one module once however many export paths select it",
    fixture: "control",
    configFile: "export-paths.config.json",
    expected: {
      status: "ready",
      mode: "code-first",
      origin: "config",
      diagnosticCodes: [],
      documentModels: [
        {
          documentType: "test/invoice",
          version: 1,
          source: {
            specifier: "./src/invoice.ts",
            exportPath: ["invoiceFamily", "modules", "0"],
          },
        },
        {
          documentType: "test/invoice",
          version: 2,
          source: {
            specifier: "./src/invoice.ts",
            exportPath: ["invoiceFamily", "modules", "1"],
          },
        },
      ],
      upgradeManifestTypes: ["test/invoice"],
      imported: ["./src/invoice.ts"],
    },
  },
  {
    name: "replaces the configured entries with a CLI selection",
    fixture: "control",
    cliSources: ["./src/invoice.ts#/invoiceV1"],
    expected: {
      status: "ready",
      mode: "code-first",
      origin: "cli",
      diagnosticCodes: [],
      documentModels: [
        {
          documentType: "test/invoice",
          version: 1,
          source: { specifier: "./src/invoice.ts", exportPath: ["invoiceV1"] },
        },
      ],
      imported: ["./src/invoice.ts"],
    },
  },
  {
    name: "names both positions of a duplicated entry and imports nothing",
    fixture: "control",
    configFile: "duplicate.config.json",
    expected: {
      status: "failed",
      mode: "code-first",
      origin: "config",
      diagnosticCodes: ["PH-CONFIG-DUPLICATE-SOURCE"],
      documentModels: [],
      imported: [],
    },
  },
  {
    name: "reports a configured export that the namespace does not have",
    fixture: "control",
    configFile: "missing-export.config.json",
    expected: {
      status: "failed",
      mode: "code-first",
      origin: "config",
      diagnosticCodes: ["PH-CONFIG-SOURCE-INVALID"],
      documentModels: [],
      imported: ["./src/invoice.ts"],
    },
  },
  {
    name: "keeps every diagnostic a structured compilation failure carried",
    fixture: "failures",
    expected: {
      status: "failed",
      mode: "code-first",
      origin: "config",
      diagnosticCodes: ["PH-DM-STATE-ROOT-INVALID", "PH-DM-STATE-ROOT-INVALID"],
      documentModels: [
        {
          documentType: "test/healthy",
          version: 1,
          source: { specifier: "./src/healthy.ts", exportPath: ["healthy"] },
        },
      ],
      imported: ["./src/healthy.ts", "./src/structured.ts"],
    },
  },
  {
    name: "reports an ordinary import failure for one source only",
    fixture: "failures",
    configFile: "throwing.config.json",
    expected: {
      status: "failed",
      mode: "code-first",
      origin: "config",
      diagnosticCodes: ["PH-IMPORT-FAILED"],
      documentModels: [
        {
          documentType: "test/healthy",
          version: 1,
          source: { specifier: "./src/healthy.ts", exportPath: ["healthy"] },
        },
      ],
      imported: ["./src/healthy.ts", "./src/throws.ts"],
    },
  },
  {
    name: "refuses to call a source that exports nothing a silent success",
    fixture: "failures",
    configFile: "nothing.config.json",
    expected: {
      status: "failed",
      mode: "code-first",
      origin: "config",
      diagnosticCodes: ["PH-PKG-DEFINITION-UNRECOGNIZED"],
      documentModels: [],
      imported: ["./src/empty.ts"],
    },
  },
  {
    name: "reports two distinct values claiming one document type and version",
    fixture: "collisions",
    expected: {
      status: "failed",
      mode: "code-first",
      origin: "config",
      diagnosticCodes: ["PH-PKG-LOGICAL-COLLISION"],
      documentModels: [
        {
          documentType: "test/ledger",
          version: 1,
          source: { specifier: "./src/first.ts", exportPath: ["ledger"] },
        },
        {
          documentType: "test/ledger",
          version: 1,
          source: { specifier: "./src/second.ts", exportPath: ["ledgerCopy"] },
        },
      ],
      imported: ["./src/first.ts", "./src/second.ts"],
    },
  },
  {
    name: "diagnoses a manifest that claims a version no module publishes",
    fixture: "collisions",
    configFile: "manifest.config.json",
    expected: {
      status: "failed",
      mode: "code-first",
      origin: "config",
      diagnosticCodes: ["PH-DM-DECLARATION-INVALID"],
      documentModels: [
        {
          documentType: "test/ledger",
          version: 1,
          source: {
            specifier: "./src/manifest-mismatch.ts",
            exportPath: ["ledger"],
          },
        },
      ],
      upgradeManifestTypes: ["test/ledger"],
      imported: ["./src/manifest-mismatch.ts"],
    },
  },
  {
    name: "reports two distinct manifests claiming one document type",
    fixture: "collisions",
    configFile: "manifest-collision.config.json",
    expected: {
      status: "failed",
      mode: "code-first",
      origin: "config",
      diagnosticCodes: ["PH-PKG-LOGICAL-COLLISION"],
      documentModels: [
        {
          documentType: "test/ledger",
          version: 1,
          source: { specifier: "./src/manifest-a.ts", exportPath: ["ledger"] },
        },
      ],
      upgradeManifestTypes: ["test/ledger", "test/ledger"],
      imported: ["./src/manifest-a.ts", "./src/manifest-b.ts"],
    },
  },
  {
    name: "replaces an unsupported ignored field with a CLI selection",
    fixture: "configs",
    configFile: "unsupported.config.json",
    cliSources: ["./src/models.ts"],
    expected: {
      status: "failed",
      mode: "code-first",
      origin: "cli",
      diagnosticCodes: ["PH-PKG-DEFINITION-UNRECOGNIZED"],
      documentModels: [],
      imported: ["./src/models.ts"],
    },
  },
  {
    name: "skips an explicit schema-first package without importing anything",
    fixture: "schema-first",
    expected: {
      status: "skipped",
      mode: "schema-first",
      origin: "config",
      diagnosticCodes: [],
      documentModels: [],
      imported: [],
    },
  },
  {
    name: "fails a package that never declared definitionSources",
    fixture: "configs",
    expected: {
      status: "failed",
      mode: "code-first",
      origin: "config",
      diagnosticCodes: ["PH-CONFIG-SOURCES-MISSING"],
      documentModels: [],
      imported: [],
    },
  },
  {
    name: "fails an empty code-first list",
    fixture: "configs",
    configFile: "empty.config.json",
    expected: {
      status: "failed",
      mode: "code-first",
      origin: "config",
      diagnosticCodes: ["PH-CONFIG-SOURCES-MISSING"],
      documentModels: [],
      imported: [],
    },
  },
  {
    name: "fails a format version this release does not read",
    fixture: "configs",
    configFile: "unsupported.config.json",
    expected: {
      status: "failed",
      mode: "code-first",
      origin: "config",
      diagnosticCodes: ["PH-CONFIG-VERSION-UNSUPPORTED"],
      documentModels: [],
      imported: [],
    },
  },
  {
    name: "rejects a specifier that leaves the package root",
    fixture: "configs",
    configFile: "outside.config.json",
    expected: {
      status: "failed",
      mode: "code-first",
      origin: "config",
      diagnosticCodes: ["PH-CONFIG-SOURCE-OUTSIDE-PACKAGE"],
      documentModels: [],
      imported: [],
    },
  },
  {
    name: "rejects a malformed entry and a non-relative specifier together",
    fixture: "configs",
    configFile: "entry-shape.config.json",
    expected: {
      status: "failed",
      mode: "code-first",
      origin: "config",
      diagnosticCodes: ["PH-CONFIG-SOURCE-INVALID", "PH-CONFIG-SOURCE-INVALID"],
      documentModels: [],
      imported: [],
    },
  },
  {
    name: "fails a config file that is not JSON",
    fixture: "configs",
    configFile: "malformed.config.json.txt",
    expected: {
      status: "failed",
      mode: "code-first",
      origin: "config",
      diagnosticCodes: ["PH-CONFIG-SOURCE-INVALID"],
      documentModels: [],
      imported: [],
    },
  },
  {
    name: "still fails a missing config file when --source is present",
    fixture: "configs",
    configFile: "absent.config.json",
    cliSources: ["./src/models.ts"],
    expected: {
      status: "failed",
      mode: "code-first",
      origin: "config",
      diagnosticCodes: ["PH-CONFIG-SOURCE-INVALID"],
      documentModels: [],
      imported: [],
    },
  },
  {
    name: "overrides an unsupported ignored field with a CLI selection",
    fixture: "control",
    configFile: "duplicate.config.json",
    cliSources: ["./src/invoice.ts#/invoiceV1"],
    expected: {
      status: "ready",
      mode: "code-first",
      origin: "cli",
      diagnosticCodes: [],
      documentModels: [
        {
          documentType: "test/invoice",
          version: 1,
          source: { specifier: "./src/invoice.ts", exportPath: ["invoiceV1"] },
        },
      ],
      imported: ["./src/invoice.ts"],
    },
  },
];

/** Wraps an adapter so a case can assert exactly which modules were imported. */
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

function documentTypeOf(module: unknown): string {
  const stored = (module as { documentModel?: { global?: { id?: unknown } } })
    .documentModel;
  return typeof stored?.global?.id === "string" ? stored.global.id : "";
}

/**
 * Runs one case against one adapter and reduces the result to the facts every
 * adapter must agree on.
 */
export async function runLoaderSelection(
  selection: LoaderSelection,
  createImporter: (packageRoot: string) => TypeScriptSourceImportInterface,
  /** Runs before the importer is built; a build-backed adapter stages here. */
  prepare?: (packageRoot: string) => Promise<void>,
): Promise<ContractOutcome> {
  const fixture = materializeFixturePackage(selection.fixture);
  try {
    await prepare?.(fixture.root);
    const importer = countingImporter(createImporter(fixture.root));
    const loader = new DefinitionSourceLoader(importer);
    const result = await loader.normalizeDefinitionSources({
      configFile: join(
        fixture.root,
        selection.configFile ?? "powerhouse.config.json",
      ),
      ...(selection.cliSources !== undefined && {
        cliSources: selection.cliSources,
      }),
      packageRevision: packageRevisionOf(fixture.root),
    });
    await loader.dispose();
    return {
      status: result.status,
      mode: result.sourceSet.mode,
      origin: result.sourceSet.origin,
      diagnosticCodes: result.diagnostics.map(
        (diagnostic) => diagnostic.code as string,
      ),
      documentModels: result.documentModels.map((entry) => ({
        documentType: documentTypeOf(entry.value),
        version: (entry.value as { version: number }).version,
        source: entry.source,
      })),
      upgradeManifestTypes: result.upgradeManifests.map(
        (entry) => entry.value.documentType,
      ),
      imported: [...importer.imported].sort(),
      diagnostics: result.diagnostics,
    };
  } finally {
    fixture.dispose();
  }
}
