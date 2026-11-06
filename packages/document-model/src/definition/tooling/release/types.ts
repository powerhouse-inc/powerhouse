import type { DefinitionDiagnostic } from "@powerhousedao/shared/document-model";
import type { DefinitionCheckInput } from "../report/types.js";

/**
 * One reason a host would not serve a model as declared. Plain data, so a
 * host's validator result is passed in as is and tooling never imports a host.
 */
export type HostValidationFindingData =
  | {
      readonly kind: "scalar-unbound";
      readonly documentType: string;
      readonly scalar: string;
    }
  | {
      /** `scalar-uncomparable`: equal metadata, validators that could not be compared. */
      readonly kind: "scalar-mismatch" | "scalar-uncomparable";
      readonly documentType: string;
      readonly scalar: string;
      readonly packageName: string;
      /** Canonical JSON of the stored scalar metadata, with the validator when known. */
      readonly declared: string;
      readonly registered: string;
    }
  | {
      readonly kind: "definition-invalid" | "definition-mismatch";
      readonly documentType: string;
      /** The host's wire diagnostics, with paths into the module. */
      readonly diagnostics: readonly DefinitionDiagnostic[];
    };

/** @experimental A host validator's result, as ph-cli passes it to `releaseChecks`. */
export type HostValidationEvidence =
  | {
      readonly completed: true;
      readonly findings: readonly HostValidationFindingData[];
    }
  | {
      /** The host validator could not run over the package. */
      readonly completed: false;
      /** What stopped it, package relative. */
      readonly reason: string;
      readonly findings: readonly HostValidationFindingData[];
    };

/** @experimental The evidence ph-cli gathers for the release profile. */
export type ReleaseEvidence = { readonly host: HostValidationEvidence };

/** @experimental The input `releaseChecks` read. */
export type ReleaseCheckInput = DefinitionCheckInput & {
  readonly release: ReleaseEvidence;
};
