import { defineDiagnosticCatalog } from "./diagnostics.js";

export const kernelDiagnostics = defineDiagnosticCatalog({
  "PH-DEF-OPTION-INVALID": {
    severity: "error",
    phase: "definition",
    meaning:
      "An option is malformed: wrong type, accessor, symbol key, non-plain object, an explicit undefined or non-JSON default, or an @equals pattern the generator cannot write",
  },
  "PH-DEF-COMPATIBILITY-INVALID": {
    severity: "error",
    phase: "definition",
    meaning:
      "A location-free GraphQL compatibility AST is malformed or disagrees with the stored definitions it accompanies",
  },
});
