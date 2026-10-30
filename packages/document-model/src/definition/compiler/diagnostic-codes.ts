import { defineDiagnosticCatalog } from "../kernel/diagnostics.js";

export const compilerDiagnostics = defineDiagnosticCatalog({
  "PH-DM-DUPLICATE-ACTION": {
    severity: "error",
    phase: "definition",
    meaning: "Two operations derive the same persisted action type",
  },
  "PH-DM-DUPLICATE-NAME": {
    severity: "error",
    phase: "definition",
    meaning:
      "Two declarations derive the same module, GraphQL type, or creator name",
  },
  "PH-DM-IDENTITY-INVALID": {
    severity: "error",
    phase: "definition",
    meaning:
      "An identity segment, compatibility ID, or derived UUID violates the V1 contract",
  },
});
