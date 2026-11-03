import {
  defaultBaseState,
  type DefinitionDiagnostic,
  type DefinitionSource,
} from "@powerhousedao/shared/document-model";
import { readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import type { ScalarDefinition } from "../../../scalars/types.js";
import { compareCodeUnits } from "../../kernel/primitives.js";
import type {
  DefinitionProducer,
  DefinitionRelocation,
  ProducedDefinitions,
} from "../adapters/producer.js";
import { isWithin } from "../definition-source-resolution.js";
import { toolingDiagnostics } from "../diagnostic-codes.js";
import { describeThrown } from "../structured-diagnostics.js";
import { loadProjectScalars } from "./project-scalars.js";
import { adaptSchemaFirstDocumentModelModule } from "./schema-first-document-model-module-adapter.js";
import { storedModelRelocation } from "./stored-locations.js";

type StoredModelFiles = {
  readonly files: readonly string[];
  readonly diagnostics: readonly DefinitionDiagnostic[];
};

function unreadable(
  packageRoot: string,
  path: string,
  what: string,
  error: unknown,
): DefinitionDiagnostic {
  return toolingDiagnostics.create({
    code: "PH-IMPORT-FAILED",
    source: { specifier: packageSpecifier(packageRoot, path) },
    path: [],
    message: `The ${what} could not be read, so the stored models in it are not checked.`,
    expected: `a readable ${what}`,
    received: describeThrown(error),
    repair: "Fix the permissions of the path.",
  });
}

function outsidePackage(specifier: `./${string}`): DefinitionDiagnostic {
  return toolingDiagnostics.create({
    code: "PH-CONFIG-SOURCE-OUTSIDE-PACKAGE",
    source: { specifier },
    path: [],
    message:
      "The stored document model resolves through a symlink that leaves the package root, so it is not this package's model.",
    expected: "a real path contained by the package root",
    received: specifier,
    repair:
      "Replace the symlink with a model file that really lives in this package.",
  });
}

/**
 * A missing models directory holds no models; any other read failure is
 * reported. A symlinked model directory or file counts when its real path
 * stays in the package.
 */
function storedModelFiles(
  packageRoot: string,
  documentModelsDir: string,
): StoredModelFiles {
  let names: string[];
  let packageRootIdentity: string;
  try {
    packageRootIdentity = realpathSync.native(packageRoot);
    names = readdirSync(documentModelsDir).sort(compareCodeUnits);
  } catch (error) {
    return {
      files: [],
      diagnostics:
        (error as NodeJS.ErrnoException).code === "ENOENT"
          ? []
          : [
              unreadable(
                packageRoot,
                documentModelsDir,
                "document models directory",
                error,
              ),
            ],
    };
  }
  const files: string[] = [];
  const diagnostics: DefinitionDiagnostic[] = [];
  for (const name of names) {
    const directory = join(documentModelsDir, name);
    const file = join(directory, `${name}.json`);
    let real: string;
    try {
      if (
        !statSync(directory, { throwIfNoEntry: false })?.isDirectory() ||
        !statSync(file, { throwIfNoEntry: false })?.isFile()
      ) {
        continue;
      }
      real = realpathSync.native(file);
    } catch (error) {
      diagnostics.push(
        unreadable(packageRoot, directory, "document model directory", error),
      );
      continue;
    }
    if (isWithin(packageRootIdentity, real)) files.push(file);
    else diagnostics.push(outsidePackage(packageSpecifier(packageRoot, file)));
  }
  return { files, diagnostics };
}

function packageSpecifier(packageRoot: string, file: string): `./${string}` {
  return `./${relative(packageRoot, file).split(sep).join("/")}`;
}

function storedVersion(value: unknown): number | undefined {
  const specifications = (value as { specifications?: unknown } | null)
    ?.specifications;
  if (!Array.isArray(specifications)) return undefined;
  const version = (specifications.at(-1) as { version?: unknown } | undefined)
    ?.version;
  return typeof version === "number" ? version : undefined;
}

function adaptStoredModelFile(
  file: string,
  source: DefinitionSource,
  scalars: readonly ScalarDefinition[],
): Omit<ProducedDefinitions, "relocations"> & {
  readonly relocation?: DefinitionRelocation;
} {
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch (error) {
    return {
      artifacts: [],
      diagnostics: [
        toolingDiagnostics.create({
          code: "PH-IMPORT-FAILED",
          source,
          path: [],
          message: "The stored document model file could not be read.",
          expected: "a readable JSON file",
          received: describeThrown(error),
          repair: "Fix the file's permissions.",
        }),
      ],
    };
  }
  let stored: unknown;
  try {
    stored = JSON.parse(text);
  } catch (error) {
    return {
      artifacts: [],
      diagnostics: [
        toolingDiagnostics.create({
          code: "PH-DM-DECLARATION-INVALID",
          source,
          path: [],
          message: "The stored document model is not JSON.",
          expected: "the JSON the document model editor saves",
          received: describeThrown(error),
          repair:
            "Repair the JSON, or save the model again from the document model editor.",
        }),
      ],
    };
  }
  const version = storedVersion(stored);
  // Not createState: it fills absent members with defaults, which would hide
  // a malformed file.
  const result = adaptSchemaFirstDocumentModelModule(
    { ...defaultBaseState(), global: stored, local: {} },
    source,
    { scalars, ...(version !== undefined && { version }) },
  );
  const artifact = result.artifacts.at(0);
  return {
    // Every stored version is served, and each carries the whole history.
    artifacts:
      artifact === undefined
        ? []
        : artifact.definition.specifications.map((specification) => ({
            ...artifact,
            version: specification.version,
          })),
    ...(artifact !== undefined && {
      relocation: storedModelRelocation(artifact),
    }),
    // The adapter roots shape errors at the wrapping state's `global`, which
    // is the file itself.
    diagnostics: result.diagnostics.map((diagnostic) => ({
      ...diagnostic,
      source,
      path:
        diagnostic.path[0] === "global"
          ? diagnostic.path.slice(1)
          : diagnostic.path,
    })),
  };
}

/**
 * Normalizes every `<documentModelsDir>/<name>/<name>.json` a schema-first
 * package stores, with the project scalars `scalars/index.ts` exports. A
 * directory or file that cannot be read, or a file that cannot be adapted,
 * is a diagnostic.
 */
export const readStoredDocumentModels: DefinitionProducer = async (input) => {
  const { packageRoot, documentModelsDir } = input;
  if (documentModelsDir === undefined) {
    return { artifacts: [], diagnostics: [], relocations: new Map() };
  }
  const { files, diagnostics } = storedModelFiles(
    packageRoot,
    documentModelsDir,
  );
  if (files.length === 0) {
    return { artifacts: [], diagnostics, relocations: new Map() };
  }
  const scalars = await loadProjectScalars(input);
  const relocations = new Map<string, DefinitionRelocation>();
  const results = files.map((file) => {
    const specifier = packageSpecifier(packageRoot, file);
    const result = adaptStoredModelFile(
      file,
      { specifier },
      scalars.definitions,
    );
    if (result.relocation !== undefined) {
      relocations.set(specifier, result.relocation);
    }
    return result;
  });
  return {
    artifacts: results.flatMap((result) => result.artifacts),
    diagnostics: [
      ...diagnostics,
      ...scalars.diagnostics,
      ...results.flatMap((result) => result.diagnostics),
    ],
    relocations,
  };
};
