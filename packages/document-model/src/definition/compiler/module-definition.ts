import type {
  DefinitionPath,
  DocumentModelDefinition,
} from "@powerhousedao/shared/document-model";
import type { DefinitionDiagnosticInput } from "../kernel/diagnostics.js";
import type { CompilerDiagnosticCode } from "./diagnostic-codes.js";

/**
 * Why `definition` cannot serve the module it is attached to: another
 * document type, or no specification for the module's version.
 */
export function definitionModuleMismatch(
  definition: DocumentModelDefinition,
  module: { readonly documentType: string; readonly version?: number },
  path: DefinitionPath,
): DefinitionDiagnosticInput<CompilerDiagnosticCode> | undefined {
  if (definition.model.documentType !== module.documentType) {
    return {
      code: "PH-DM-DECLARATION-INVALID",
      path: [...path, "model", "documentType"],
      message:
        "The structured definition and the stored model describe different document types.",
      expected: module.documentType,
      received: definition.model.documentType,
      repair:
        "Materialize the module and its definition from the same declaration.",
    };
  }
  const { version } = module;
  if (
    version !== undefined &&
    !definition.specifications.some((entry) => entry.version === version)
  ) {
    return {
      code: "PH-DM-DECLARATION-INVALID",
      path: [...path, "specifications"],
      message: `The specification history carries no version ${version}, which is the version this module serves.`,
      expected: `a specification for version ${version}`,
      received: definition.specifications
        .map((entry) => String(entry.version))
        .join(", "),
      repair:
        "Compose the versions with defineDocumentModelFamily so every module carries the complete history.",
    };
  }
  return undefined;
}
