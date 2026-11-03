import type {
  DefinitionRef,
  DocumentModelSpecificationDefinition,
} from "@powerhousedao/shared/document-model";
import type { NormalizedDocumentModelArtifact } from "../adapters/types.js";

/**
 * The specification an artifact serves, and its index in the history. Every
 * member of a family carries the whole history, so a check that read every
 * specification of every artifact would report one defect once per member.
 */
export function servedSpecification(artifact: NormalizedDocumentModelArtifact):
  | {
      readonly specification: DocumentModelSpecificationDefinition;
      readonly index: number;
    }
  | undefined {
  const index = artifact.definition.specifications.findIndex(
    ({ version }) => version === artifact.version,
  );
  return index === -1
    ? undefined
    : { specification: artifact.definition.specifications[index], index };
}

export function documentModelRef(
  artifact: NormalizedDocumentModelArtifact,
): DefinitionRef {
  return {
    kind: "document-model",
    key: artifact.documentType,
    version: artifact.version,
  };
}
