import { defineDiagnosticCatalog } from "../../kernel/diagnostics.js";
import { toolingDiagnostics } from "../diagnostic-codes.js";

export const inspectDiagnostics = defineDiagnosticCatalog(
  {
    "PH-INSPECT-SELECTION-UNKNOWN": {
      severity: "error",
      // A mistyped selection is a usage error, not a defect of the package.
      phase: "configuration",
      meaning:
        "The selected document type and version is not served by any model of the package",
    },
  },
  toolingDiagnostics,
);
