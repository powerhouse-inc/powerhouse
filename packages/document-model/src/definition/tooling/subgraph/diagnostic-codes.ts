import { defineDiagnosticCatalog } from "../../kernel/diagnostics.js";
import { toolingDiagnostics } from "../diagnostic-codes.js";

export const subgraphToolingDiagnostics = defineDiagnosticCatalog(
  {
    "PH-SG-DESCRIBE-FAILED": {
      severity: "error",
      phase: "import",
      meaning:
        "A code-first subgraph class threw from describe() or returned something that is not a description",
    },
    "PH-SG-PROTOCOL-UNSUPPORTED": {
      severity: "error",
      phase: "package",
      meaning:
        "A subgraph class carries a protocol version this release does not read, or a malformed protocol",
    },
    "PH-SG-NAME-MISSING": {
      severity: "error",
      phase: "package",
      meaning:
        "A code-first subgraph class declares no subgraphName and no other export extends it",
    },
    "PH-SG-DUPLICATE-NAME": {
      severity: "error",
      phase: "package",
      meaning: "Two code-first subgraphs of one package share a name",
    },
    "PH-SG-TYPE-CONFLICT": {
      severity: "error",
      phase: "composition",
      meaning:
        "Two code-first subgraphs serve one root field, or one type name with different definitions",
    },
    "PH-SG-DOCUMENT-MODEL-TYPE-CONFLICT": {
      severity: "error",
      phase: "composition",
      meaning:
        "A code-first subgraph declares a type that a document model of the package generates",
    },
    "PH-SG-NAME-RESERVED": {
      severity: "error",
      phase: "package",
      meaning:
        "A code-first subgraph has the name of a built-in subgraph or of a document model's subgraph, so a host refuses it",
    },
    "PH-SG-HOST-TYPE-CONFLICT": {
      severity: "error",
      phase: "composition",
      meaning:
        "A code-first subgraph declares a type or root field that a host's built-in subgraphs or base document models own, so a host refuses it",
    },
    "PH-SG-SCALAR-UNREGISTERED": {
      severity: "error",
      phase: "package",
      meaning:
        "A code-first subgraph uses a package scalar that scalars/index.ts does not export under its name",
    },
    "PH-SG-SCHEMA-FIRST-CONFLICT": {
      severity: "warning",
      phase: "composition",
      meaning:
        "A code-first subgraph and a schema-first subgraph claim one name, root field or differently defined type",
    },
    "PH-SG-SCHEMA-FIRST-UNCHECKED": {
      severity: "warning",
      phase: "composition",
      meaning:
        "The SDL of a schema-first subgraph could not be read from its source text, so its conflicts were not checked",
    },
  },
  toolingDiagnostics,
);

export type SubgraphToolingDiagnosticCode =
  keyof typeof subgraphToolingDiagnostics.codes;
