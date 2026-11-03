import { defineDiagnosticCatalog } from "../../kernel/diagnostics.js";
import { toolingDiagnostics } from "../diagnostic-codes.js";

export const checkDiagnostics = defineDiagnosticCatalog(
  {
    "PH-DM-DUPLICATE-ERROR-CODE": {
      severity: "error",
      phase: "definition",
      meaning:
        "Two errors of one operation persist the same error code, so a caller cannot tell them apart",
    },
    "PH-DM-ERROR-CLASS-CONFLICT": {
      severity: "error",
      phase: "definition",
      meaning:
        "Two errors of one module generate the same error class with different codes",
    },
    "PH-PKG-SCALAR-CONFLICT": {
      severity: "error",
      phase: "package",
      meaning:
        "Two models of one package use different project scalars with one name, and a host declares each scalar once",
    },
    "PH-PKG-DEFINITION-UNREGISTERED": {
      severity: "error",
      phase: "package",
      meaning:
        "A code-first document model under the document models directory is reached by no definitionSources entry, so the package leaves it out",
    },
  },
  toolingDiagnostics,
);

export type CheckDiagnosticCode = keyof typeof checkDiagnostics.codes;
