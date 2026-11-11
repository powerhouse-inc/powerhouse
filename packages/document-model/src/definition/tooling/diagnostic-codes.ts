import { defineDiagnosticCatalog } from "../kernel/diagnostics.js";
import { modelDiagnostics } from "../model/diagnostic-codes.js";

export const toolingDiagnostics = defineDiagnosticCatalog(
  {
    "PH-CONFIG-SOURCE-INVALID": {
      severity: "error",
      phase: "configuration",
      meaning:
        "The config file, the models directory, a model directory's entry, or an export pointer cannot select a module export",
    },
    "PH-CONFIG-SOURCE-OUTSIDE-PACKAGE": {
      severity: "error",
      phase: "configuration",
      meaning:
        "The models directory, a model directory, or the real path behind its symlinks, leaves the package root",
    },
    "PH-CONFIG-DUPLICATE-SOURCE": {
      severity: "error",
      phase: "configuration",
      meaning: "Two sources select the same module and export path",
    },
    "PH-IMPORT-FAILED": {
      severity: "error",
      phase: "import",
      meaning:
        "A selected module is missing, throws while it is evaluated, or the import adapter returned no namespace",
    },
    "PH-PKG-DEFINITION-UNRECOGNIZED": {
      severity: "error",
      phase: "package",
      meaning:
        "A selected export holds no materialized document model, family, or upgrade manifest",
    },
    "PH-PKG-STORED-SPEC-MISSING": {
      severity: "warning",
      phase: "package",
      meaning:
        "A model directory holds generated schema-first code without its stored specification",
    },
    "PH-PKG-DEFINITION-UNINSPECTABLE": {
      severity: "error",
      phase: "package",
      meaning:
        "A selected export hides its members behind an accessor or a Proxy",
    },
    "PH-PKG-LOGICAL-COLLISION": {
      severity: "error",
      phase: "package",
      meaning:
        "Two distinct values claim one document type and version, or one upgrade manifest document type",
    },
  },
  modelDiagnostics,
);

export type ToolingDiagnosticCode = keyof typeof toolingDiagnostics.codes;
