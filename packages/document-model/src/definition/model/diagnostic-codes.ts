import { compilerDiagnostics } from "../compiler/diagnostic-codes.js";
import { defineDiagnosticCatalog } from "../kernel/diagnostics.js";

export const modelDiagnostics = defineDiagnosticCatalog(
  {
    "PH-DM-STATE-ROOT-INVALID": {
      severity: "error",
      phase: "definition",
      meaning:
        "A required state root is absent, is not an object, or has the wrong canonical name",
    },
    "PH-DM-SCOPE-UNSUPPORTED": {
      severity: "error",
      phase: "definition",
      meaning: "A definition requests a scope outside global or local",
    },
    "PH-AUTH-UNSUPPORTED": {
      severity: "error",
      phase: "authorization",
      meaning: "Authorization was declared outside the version auth callback",
    },
  },
  compilerDiagnostics,
);

export type ModelDiagnosticCode = keyof typeof modelDiagnostics.codes;
