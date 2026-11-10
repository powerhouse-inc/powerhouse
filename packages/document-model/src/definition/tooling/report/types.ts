import type {
  DefinitionCheckSkipReason,
  DefinitionDiagnostic,
} from "@powerhousedao/shared/document-model";
import type { DefinitionRelocation } from "../adapters/producer.js";
import type { NormalizedDocumentModelArtifact } from "../adapters/types.js";
import type { DefinitionSourceSet } from "../definition-source-types.js";

/** A code-first declaration under the document models directory that no model entry exports. */
export type UnregisteredDefinition = {
  readonly kind: "document-model";
  /** `./<documentModelsDir>/<name>/`. */
  readonly unit: `./${string}`;
  /** The declaring module: the directory's `index.ts` when it declares, else the first declaring file. */
  readonly specifier: `./${string}`;
  /**
   * `not-exported`: an entry module evaluated the declaring files without
   * exporting the model. `stored-directory`: the directory holds a stored
   * specification, so discovery reads it as schema-first.
   */
  readonly reason: "unreached" | "not-exported" | "stored-directory";
};

/**
 * @experimental What every registered check reads. A wider input, such as
 * ph-cli's release evidence, lets a later layer register checks that need
 * more, without changing the runner.
 */
export type DefinitionCheckInput = {
  readonly sourceSet: DefinitionSourceSet;
  /** Sorted by document type, version and source. */
  readonly artifacts: readonly NormalizedDocumentModelArtifact[];
  readonly unregistered: readonly UnregisteredDefinition[];
};

/** What the check runner and inspection need besides the check input. */
export type LoadedDefinitionProject = DefinitionCheckInput & {
  readonly skipReason?: DefinitionCheckSkipReason;
  /** Load and adapter diagnostics, with package-relative text. */
  readonly diagnostics: readonly DefinitionDiagnostic[];
  /** By source specifier: where a check's normalized path sits in that source. */
  readonly relocations?: ReadonlyMap<string, DefinitionRelocation>;
};
