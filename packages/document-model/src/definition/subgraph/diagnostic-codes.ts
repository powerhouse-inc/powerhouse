import { compilerDiagnostics } from "../compiler/diagnostic-codes.js";
import { defineDiagnosticCatalog } from "../kernel/diagnostics.js";

export const subgraphDiagnostics = defineDiagnosticCatalog(
  {
    "PH-SG-NAME-INVALID": {
      severity: "error",
      phase: "definition",
      meaning: "A subgraph name is not lowercase kebab-case",
    },
    "PH-SG-ENTRY-INVALID": {
      severity: "error",
      phase: "definition",
      meaning:
        "A subgraph declares no entries, or an entry is not built by the entry builders or has malformed options",
    },
    "PH-SG-RESOLVER-MISSING": {
      severity: "error",
      phase: "definition",
      meaning:
        "An entry has no resolve, subscribe, or resolveType function where it needs one",
    },
    "PH-SG-DUPLICATE-COORDINATE": {
      severity: "error",
      phase: "definition",
      meaning:
        "Two entries, or an entry and a declared field, bind the same schema coordinate",
    },
    "PH-SG-FIELD-PARENT-INVALID": {
      severity: "error",
      phase: "definition",
      meaning:
        "A computed field's parent is not an object type that the subgraph's entries reach",
    },
    "PH-SG-RESOLVE-TYPE-INVALID": {
      severity: "error",
      phase: "definition",
      meaning:
        "resolveType names a type that is not an interface or union that the subgraph's entries reach",
    },
    "PH-SG-INTERFACE-UNIMPLEMENTED": {
      severity: "warning",
      phase: "definition",
      meaning:
        "An interface the subgraph serves has no object type in the subgraph that implements it",
    },
    "PH-SG-FEDERATION-UNSUPPORTED": {
      severity: "error",
      phase: "definition",
      meaning:
        "A typed subgraph uses an Apollo Federation directive or declares a Query field Federation adds",
    },
  },
  compilerDiagnostics,
);

export type SubgraphDiagnosticCode = keyof typeof subgraphDiagnostics.codes;
