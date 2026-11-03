import type {
  DefinitionCheckReport,
  DefinitionDiagnostic,
  DefinitionPath,
  DefinitionSource,
} from "@powerhousedao/shared/document-model";
import type { DefinitionRelocation } from "../adapters/producer.js";
import { duplicateIdentitiesCheck } from "./checks/duplicate-identities.js";
import { graphqlSchemaCheck } from "./checks/graphql-schema.js";
import { logicalCollisionsCheck } from "./checks/logical-collisions.js";
import { packageScalarNamesCheck } from "./checks/package-scalar-names.js";
import { retainedSerializationCheck } from "./checks/retained-serialization.js";
import { storedMaterializationCheck } from "./checks/stored-materialization.js";
import { unregisteredDefinitionsCheck } from "./checks/unregistered-definitions.js";
import { definitionCheckReport } from "../report/status.js";
import type {
  DefinitionCheckInput,
  LoadedDefinitionProject,
} from "../report/types.js";
import type { DefinitionCheck } from "./types.js";

/**
 * The checks `ph model check` runs on document models. A later layer adds its
 * own with `[...documentModelChecks, ...theirs]`.
 */
export const documentModelChecks: readonly DefinitionCheck[] = Object.freeze([
  storedMaterializationCheck,
  duplicateIdentitiesCheck,
  packageScalarNamesCheck,
  logicalCollisionsCheck,
  graphqlSchemaCheck,
  retainedSerializationCheck,
  unregisteredDefinitionsCheck,
]);

/** Moves a check's normalized paths to where each source's author edits them. */
function relocated(
  diagnostic: DefinitionDiagnostic,
  relocations: ReadonlyMap<string, DefinitionRelocation>,
): DefinitionDiagnostic {
  const at = (source: DefinitionSource | undefined, path: DefinitionPath) =>
    (source === undefined ? undefined : relocations.get(source.specifier))?.(
      path,
    ) ?? path;
  return {
    ...diagnostic,
    path: at(diagnostic.source, diagnostic.path),
    ...(diagnostic.related !== undefined && {
      related: diagnostic.related.map((location) => ({
        ...location,
        path: at(location.source, location.path),
      })),
    }),
  };
}

/**
 * @experimental Runs every check over a loaded project and builds the stored
 * check report with the project's load diagnostics. `definitions` adds
 * inventory entries a caller checked itself. Experimental while code-first
 * projects are introduced.
 */
export async function checkProjectDefinitions<
  TInput extends DefinitionCheckInput = DefinitionCheckInput,
>(
  project: LoadedDefinitionProject & TInput,
  options: {
    readonly checks?: readonly DefinitionCheck<TInput>[];
    readonly definitions?: DefinitionCheckReport["definitions"];
  } = {},
): Promise<DefinitionCheckReport> {
  const relocations = project.relocations ?? new Map();
  const diagnostics = [...project.diagnostics];
  for (const check of options.checks ?? documentModelChecks) {
    for (const diagnostic of await check.run(project)) {
      diagnostics.push(relocated(diagnostic, relocations));
    }
  }
  return definitionCheckReport({
    sourceSet: project.sourceSet,
    ...(project.skipReason !== undefined && {
      skipReason: project.skipReason,
    }),
    artifacts: project.artifacts,
    definitions: options.definitions ?? [],
    diagnostics,
  });
}
