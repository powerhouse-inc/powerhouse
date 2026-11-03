import type { DefinitionDiagnostic } from "@powerhousedao/shared/document-model";
import type { NormalizedDocumentModelArtifact } from "../adapters/types.js";
import type { DefinitionSourceSet } from "../definition-source-types.js";
import { toolingDiagnostics } from "../diagnostic-codes.js";
import { documentModelRef } from "./served-specification.js";

/**
 * A host registers one module per `documentType@version`. The loader already
 * reports two selected sources that claim one, so a claimant is reported here
 * only when it or the anchor comes from outside the selection.
 */
export function logicalCollisionDiagnostics(
  sourceSet: DefinitionSourceSet,
  [anchor, ...claimants]: readonly NormalizedDocumentModelArtifact[],
): readonly DefinitionDiagnostic[] {
  const selected = new Set(sourceSet.sources.map(({ specifier }) => specifier));
  const isSelected = (artifact: NormalizedDocumentModelArtifact) =>
    selected.has(artifact.source.specifier);
  const key = `${anchor.documentType}@${anchor.version}`;
  return claimants
    .filter((claimant) => !(isSelected(claimant) && isSelected(anchor)))
    .map((claimant) =>
      toolingDiagnostics.create({
        code: "PH-PKG-LOGICAL-COLLISION",
        source: claimant.source,
        definition: documentModelRef(claimant),
        path: [],
        message: `Two sources claim ${key}, and a host registers one module per document type and version.`,
        expected: `one source for ${key}`,
        received: `${anchor.source.specifier} and ${claimant.source.specifier}`,
        repair:
          "Keep one of the two models, or give one of them another document type.",
        related: [
          {
            source: anchor.source,
            path: [],
            message: `This source also claims ${key}.`,
          },
        ],
      }),
    );
}
