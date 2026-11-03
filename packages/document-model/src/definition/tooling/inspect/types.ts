import type {
  DefinitionDiagnostic,
  DefinitionSource,
  DocumentModelDefinition,
  Sha256Digest,
} from "@powerhousedao/shared/document-model";
import type { DefinitionStatus } from "../report/status.js";
import type { DefinitionSourceSet } from "../definition-source-types.js";

/**
 * @experimental One served version of a family, as `ph model inspect` prints
 * it. Experimental while code-first projects are introduced.
 */
export type DocumentModelInspection = {
  readonly version: number;
  readonly source: DefinitionSource;
  readonly scopes: {
    readonly global: string;
    readonly local: string | null;
  };
  readonly modules: readonly {
    readonly key: string;
    readonly name: string;
    readonly operations: readonly {
      readonly key: string;
      readonly name: string | null;
      readonly actionType: string;
      readonly scope: "global" | "local";
      readonly input: string | null;
      readonly errors: readonly {
        readonly key: string;
        readonly code: string | null;
      }[];
    }[];
  }[];
  readonly scalars: readonly {
    readonly name: string;
    readonly implementation: string;
  }[];
  readonly types: readonly string[];
};

/**
 * @experimental One definition and the versions it serves. Every version
 * carries the whole history, so the digest, name and compatibility belong to
 * the family, not to a version. Experimental while code-first projects are
 * introduced.
 */
export type DocumentModelFamilyInspection = {
  readonly documentType: string;
  readonly name: string;
  readonly extension: string;
  readonly digest: Sha256Digest;
  readonly compatibility: DocumentModelDefinition["compatibility"];
  readonly versions: readonly DocumentModelInspection[];
};

/**
 * @experimental What `ph model inspect --json` prints: deterministic, package
 * relative, and diffable between releases. Experimental while code-first
 * projects are introduced.
 */
export type DefinitionInspectionReport = {
  readonly kind: "powerhouse.definition-inspection";
  readonly formatVersion: 1;
  readonly status: DefinitionStatus;
  readonly sourceSet: DefinitionSourceSet;
  readonly families: readonly DocumentModelFamilyInspection[];
  readonly diagnostics: readonly DefinitionDiagnostic[];
  /** Present only when a selection matched exactly one model. */
  readonly definition?: DocumentModelDefinition;
};

/** @experimental */
export type DefinitionInspectionSelection = {
  readonly documentType: string;
  readonly version: number;
};
