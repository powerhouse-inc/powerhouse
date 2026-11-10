import {
  defaultBaseState,
  type DefinitionDiagnostic,
  type DefinitionSource,
} from "@powerhousedao/shared/document-model";
import { pathWithin } from "@powerhousedao/shared/clis/real-paths";
import { readFileSync, realpathSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import type { ScalarDefinition } from "../../../scalars/types.js";
import type {
  DefinitionProducer,
  DefinitionRelocation,
  ProducedDefinitions,
} from "../adapters/producer.js";
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
 * The stored specifications discovery listed. A symlinked file counts when
 * its real path stays in the package; anything but a readable file is
 * reported, never skipped, because discovery already gave the directory to
 * a schema-first model.
 */
function storedModelFiles(
  packageRoot: string,
  stored: readonly DefinitionSource[],
): StoredModelFiles {
  let packageRootIdentity: string;
  try {
    packageRootIdentity = realpathSync.native(packageRoot);
  } catch (error) {
    return {
      files: [],
      diagnostics: [
        unreadable(packageRoot, packageRoot, "package root", error),
      ],
    };
  }
  const files: string[] = [];
  const diagnostics: DefinitionDiagnostic[] = [];
  for (const { specifier } of stored) {
    const file = join(packageRoot, ...specifier.slice(2).split("/"));
    let real: string;
    try {
      if (!statSync(file).isFile()) {
        throw new Error(`${specifier} is not a file.`);
      }
      real = realpathSync.native(file);
    } catch (error) {
      diagnostics.push(
        unreadable(packageRoot, file, "stored document model file", error),
      );
      continue;
    }
    if (pathWithin(packageRootIdentity, real) !== null) files.push(file);
    else diagnostics.push(outsidePackage(specifier));
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
 * Normalizes every `<documentModelsDir>/<name>/<name>.json` discovery
 * listed, with the project scalars `scalars/index.ts` exports. A file that
 * cannot be read or adapted is a diagnostic.
 */
export const readStoredDocumentModels: DefinitionProducer = async (input) => {
  const { packageRoot, loaded } = input;
  const { files, diagnostics } = storedModelFiles(
    packageRoot,
    loaded.sourceSet.stored,
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
