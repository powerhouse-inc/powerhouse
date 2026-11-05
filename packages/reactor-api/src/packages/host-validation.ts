import type { DefinitionDiagnostic } from "@powerhousedao/shared/document-model";
import { packageScalarFindings } from "../graphql/document-model-schema/package-scalars.js";
import {
  type DocumentModelSource,
  selectDocumentModelSchemaSource,
} from "../graphql/document-model-schema/source.js";
import type { ScalarRegistry } from "../utils/scalar-types.js";

/** @experimental One reason this host would not serve a model as declared. */
export type HostValidationFinding =
  | {
      readonly kind: "scalar-unbound";
      readonly documentType: string;
      readonly scalar: string;
    }
  | {
      readonly kind: "scalar-mismatch";
      readonly documentType: string;
      readonly scalar: string;
      readonly packageName: string;
      /** Canonical JSON of the stored scalar metadata. */
      readonly declared: string;
      readonly registered: string;
    }
  | {
      readonly kind: "definition-invalid" | "definition-mismatch";
      readonly documentType: string;
      /** The wire diagnostics, with paths into the module. */
      readonly diagnostics: readonly DefinitionDiagnostic[];
    };

/** @experimental What {@link validateDocumentModelsForHost} found, in model order. */
export type HostValidationResult = {
  readonly findings: readonly HostValidationFinding[];
};

function findingsOf(
  model: DocumentModelSource,
  registry: ScalarRegistry,
): HostValidationFinding[] {
  const { fallback } = selectDocumentModelSchemaSource(model);
  if (fallback !== undefined) {
    return fallback.reason === "unreadable"
      ? []
      : [
          {
            kind: `definition-${fallback.reason}`,
            documentType: model.documentModel.global.id,
            diagnostics: fallback.diagnostics,
          },
        ];
  }
  // packageScalarFindings selects through the logging selector, which logs
  // only a fallback. A model with one is served from stored SDL and declares
  // no package scalars, so only models without one reach it.
  return packageScalarFindings([model], registry).map((finding) =>
    finding.kind === "unbound"
      ? { ...finding, kind: "scalar-unbound" }
      : { ...finding, kind: "scalar-mismatch" },
  );
}

/**
 * @experimental What this host would refuse or serve differently in the
 * given models: package scalars without a registered binding or bound
 * differently, and definitions it serves from stored SDL because they are
 * invalid or describe another module. Logs nothing and reports each problem
 * as a finding; ph-cli records the result as release evidence. `registry` is built as the host
 * builds it: `buildScalarRegistry` over `scalarExportsOf` each package's
 * `scalars` entry.
 */
export function validateDocumentModelsForHost(
  models: readonly DocumentModelSource[],
  registry: ScalarRegistry,
): HostValidationResult {
  return { findings: models.flatMap((model) => findingsOf(model, registry)) };
}

/** One finding as the clause of a host's refusal log line. */
export function describeHostValidationFinding(
  finding: HostValidationFinding,
): string {
  switch (finding.kind) {
    case "scalar-unbound":
      return `package scalar ${finding.scalar} has no registered binding`;
    case "scalar-mismatch":
      return `package scalar ${finding.scalar} is declared as ${finding.declared}, but package ${finding.packageName} registers ${finding.registered}`;
    case "definition-invalid":
    case "definition-mismatch":
      return `its definition is ${finding.kind === "definition-invalid" ? "invalid" : "for another module"}: ${finding.diagnostics.map(({ path, message }) => `${path.join(".")}: ${message}`).join(" ")}`;
  }
}
