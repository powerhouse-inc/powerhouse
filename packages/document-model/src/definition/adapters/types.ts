import type {
  DefinitionDiagnostic,
  DefinitionSource,
  DocumentModelDefinition,
  DocumentModelPHState,
  Sha256Digest,
  UpgradeManifest,
} from "@powerhousedao/shared/document-model";

/**
 * The shape both authoring approaches normalize into. A structured consumer —
 * `checkDefinitions`, `ph model inspect`, the parity suite — reads this and
 * never learns which adapter produced it.
 */

/** One specification item's stable identity, keyed by its identity path. */
export type DefinitionIdentityVector = {
  /** `module/lineItems`, `operation/lineItems/addLineItem`, and so on. */
  readonly key: string;
  readonly id: string;
};

export type NormalizedDocumentModelArtifact = {
  readonly kind: "powerhouse.document-model-artifact";
  readonly source: DefinitionSource;
  readonly documentType: string;
  /** The version this artifact is the module for. */
  readonly version: number;
  readonly definition: DocumentModelDefinition;
  /** `sha256` over the canonical JSON of `definition`. */
  readonly digest: Sha256Digest;
  /** The stored state an existing consumer reads. */
  readonly documentModel: DocumentModelPHState;
  /** Every module, operation, error, and example ID, in definition order. */
  readonly identity: readonly DefinitionIdentityVector[];
};

export type NormalizedDocumentModelResult = {
  /**
   * One artifact per version, in the order the family declares them. A source
   * that could not be normalized contributes no artifact and at least one
   * diagnostic, so one bad export never loses a sibling's report.
   */
  readonly artifacts: readonly NormalizedDocumentModelArtifact[];
  /** A family's manifest; `null` for a single module. */
  readonly upgradeManifest: UpgradeManifest<readonly number[]> | null;
  readonly diagnostics: readonly DefinitionDiagnostic[];
};
