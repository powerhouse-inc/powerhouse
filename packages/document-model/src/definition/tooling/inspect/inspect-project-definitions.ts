import type {
  DefinitionDiagnostic,
  Sha256Digest,
} from "@powerhousedao/shared/document-model";
import type { NormalizedDocumentModelArtifact } from "../adapters/types.js";
import { servedSpecification } from "../report/served-specification.js";
import {
  compareArtifacts,
  definitionStatus,
  sortedUniqueDiagnostics,
} from "../report/status.js";
import { logicalCollisionDiagnostics } from "../report/logical-collisions.js";
import type { LoadedDefinitionProject } from "../report/types.js";
import { inspectDiagnostics } from "./diagnostic-codes.js";
import type {
  DefinitionInspectionReport,
  DefinitionInspectionSelection,
  DocumentModelFamilyInspection,
  DocumentModelInspection,
} from "./types.js";

/** Keeps the capped `expected` text from cutting a key in half. */
const MAX_LISTED = 20;

function inspection(
  artifact: NormalizedDocumentModelArtifact,
): DocumentModelInspection | undefined {
  const served = servedSpecification(artifact);
  if (served === undefined) return undefined;
  const { specification } = served;
  return {
    version: artifact.version,
    source: artifact.source,
    scopes: {
      global: specification.state.global.root.name,
      local: specification.state.local.root?.name ?? null,
    },
    modules: specification.modules.map((module) => ({
      key: module.key,
      name: module.name,
      operations: module.operations.map((operation) => ({
        key: operation.key,
        name: operation.name,
        actionType: operation.actionType,
        scope: operation.scope,
        input: operation.input?.name ?? null,
        errors: operation.errors.map(({ key, code }) => ({ key, code })),
      })),
    })),
    scalars: specification.scalars.map(({ name, implementation }) => ({
      name,
      implementation,
    })),
    types: specification.types.map(({ name }) => name),
  };
}

/** Artifacts that carry one definition, and so one digest, form one family. */
function families(
  artifacts: readonly NormalizedDocumentModelArtifact[],
): readonly DocumentModelFamilyInspection[] {
  const grouped = new Map<
    Sha256Digest,
    {
      readonly first: NormalizedDocumentModelArtifact;
      readonly versions: DocumentModelInspection[];
    }
  >();
  for (const artifact of artifacts) {
    const version = inspection(artifact);
    if (version === undefined) continue;
    const family = grouped.get(artifact.digest);
    if (family === undefined) {
      grouped.set(artifact.digest, { first: artifact, versions: [version] });
    } else {
      family.versions.push(version);
    }
  }
  return [...grouped.values()].map(({ first, versions }) => ({
    documentType: first.documentType,
    name: first.definition.model.name,
    extension: first.definition.model.extension,
    digest: first.digest,
    compatibility: first.definition.compatibility,
    versions,
  }));
}

function unknownSelection(
  selection: DefinitionInspectionSelection,
  artifacts: readonly NormalizedDocumentModelArtifact[],
): DefinitionDiagnostic {
  const available = [
    ...new Set(
      artifacts.map(
        ({ documentType, version }) => `${documentType}@${version}`,
      ),
    ),
  ];
  const listed =
    available.length <= MAX_LISTED
      ? available.join(", ")
      : `${available.slice(0, MAX_LISTED).join(", ")}, and ${available.length - MAX_LISTED} more`;
  const selected = `${selection.documentType}@${selection.version}`;
  return inspectDiagnostics.create({
    code: "PH-INSPECT-SELECTION-UNKNOWN",
    path: ["selection"],
    message: `No model of this package serves ${selected}.`,
    expected: available.length === 0 ? "a package with a model" : listed,
    received: selected,
    repair:
      available.length === 0
        ? "Add a document model to the package, or register its code-first source in definitionSources."
        : `Inspect one of: ${listed}.`,
  });
}

/**
 * @experimental Describes the loaded models without running checks. With a
 * selection it answers for that model only, and adds its full definition
 * when exactly one model serves it. Experimental while code-first projects
 * are introduced.
 */
export function inspectProjectDefinitions(
  project: LoadedDefinitionProject,
  options: { readonly selection?: DefinitionInspectionSelection } = {},
): DefinitionInspectionReport {
  const artifacts = [...project.artifacts].sort(compareArtifacts);
  const { selection } = options;
  const selected =
    selection === undefined
      ? artifacts
      : artifacts.filter(
          ({ documentType, version }) =>
            documentType === selection.documentType &&
            version === selection.version,
        );
  const diagnostics = sortedUniqueDiagnostics([
    ...project.diagnostics,
    ...(selection === undefined
      ? []
      : selected.length === 0
        ? [unknownSelection(selection, artifacts)]
        : logicalCollisionDiagnostics(project.sourceSet, selected)),
  ]);
  return {
    kind: "powerhouse.definition-inspection",
    formatVersion: 1,
    status: definitionStatus({
      ...(project.skipReason !== undefined && {
        skipReason: project.skipReason,
      }),
      definitions: artifacts,
      diagnostics,
    }),
    sourceSet: project.sourceSet,
    families: families(selected),
    diagnostics,
    ...(selection !== undefined &&
      selected.length === 1 && { definition: selected[0].definition }),
  };
}
