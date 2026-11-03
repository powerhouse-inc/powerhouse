import type {
  DefinitionDiagnostic,
  DefinitionSource,
  DocumentModelDefinition,
  DocumentModelPHState,
  Sha256Digest,
  UpgradeManifest,
} from "@powerhousedao/shared/document-model";

/**
 * @experimental The shape both authoring paths normalize into. A consumer
 * reads it without learning which adapter produced it.
 */
export type NormalizedDocumentModelArtifact = {
  readonly kind: "powerhouse.document-model-artifact";
  readonly source: DefinitionSource;
  readonly documentType: string;

  readonly version: number;

  readonly definition: DocumentModelDefinition;

  readonly digest: Sha256Digest;

  readonly documentModel: DocumentModelPHState;
};

/** @experimental */
export type NormalizedDocumentModelResult = {
  readonly artifacts: readonly NormalizedDocumentModelArtifact[];

  readonly upgradeManifest: UpgradeManifest<readonly number[]> | null;
  readonly diagnostics: readonly DefinitionDiagnostic[];
};
