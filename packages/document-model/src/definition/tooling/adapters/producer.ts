import type {
  DefinitionDiagnostic,
  DefinitionPath,
  Sha256Digest,
} from "@powerhousedao/shared/document-model";
import type { DefinitionSourceLoader } from "../definition-source-loader.js";
import type { LoadedDefinitionSet } from "../definition-source-types.js";
import type { NormalizedDocumentModelArtifact } from "./types.js";

/**
 * Maps a path a check reports in normalized coordinates (served data under
 * `documentModel/global`, definition data under `specifications`) to where
 * the source's author edits it.
 */
export type DefinitionRelocation = (path: DefinitionPath) => DefinitionPath;

export type ProducedDefinitions = {
  readonly artifacts: readonly NormalizedDocumentModelArtifact[];
  readonly diagnostics: readonly DefinitionDiagnostic[];
  /** By source specifier. A source authored in normalized coordinates has none. */
  readonly relocations: ReadonlyMap<string, DefinitionRelocation>;
};

export type DefinitionProducerInput = {
  readonly loader: DefinitionSourceLoader;
  readonly configFile: string;
  readonly packageRevision: Sha256Digest;
  readonly signal?: AbortSignal;
  /** Absolute. */
  readonly packageRoot: string;
  /** The selected code-first sources, imported once for every producer. */
  readonly loaded: LoadedDefinitionSet;
  /** Absolute and inside the package; absent when the configured directory cannot be read. */
  readonly documentModelsDir?: string;
};

export type DefinitionProducer = (
  input: DefinitionProducerInput,
) => ProducedDefinitions | Promise<ProducedDefinitions>;
