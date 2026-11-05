import { defineDiagnosticCatalog } from "../../kernel/diagnostics.js";
import { toolingDiagnostics } from "../diagnostic-codes.js";

export const releaseDiagnostics = defineDiagnosticCatalog(
  {
    "PH-REL-HOST-SCALAR-UNBOUND": {
      severity: "error",
      phase: "package",
      meaning:
        "A model declares a package scalar the package registers no binding for, so a host serves it without validation",
    },
    "PH-REL-HOST-SCALAR-MISMATCH": {
      severity: "error",
      phase: "package",
      meaning:
        "A model declares a package scalar whose stored metadata differs from the binding the package registers",
    },
    "PH-REL-HOST-DEFINITION-INVALID": {
      severity: "error",
      phase: "definition",
      meaning:
        "A module's definition fails the wire shape, so a host serves the model from its stored SDL",
    },
    "PH-REL-HOST-DEFINITION-MISMATCH": {
      severity: "error",
      phase: "definition",
      meaning:
        "A module's definition does not serve that module's document type or version, so a host serves the model from its stored SDL",
    },
    "PH-REL-HOST-VALIDATION-INCOMPLETE": {
      severity: "error",
      // Not a defect of the package: the release check could not run, which
      // the report states as failed, not invalid.
      phase: "import",
      meaning:
        "Host validation did not run, so the release check cannot tell whether a host serves the package as declared",
    },
  },
  toolingDiagnostics,
);
