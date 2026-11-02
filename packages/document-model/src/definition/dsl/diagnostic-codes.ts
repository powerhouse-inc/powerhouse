import { kernelDiagnostics } from "../kernel/diagnostic-codes.js";
import { defineDiagnosticCatalog } from "../kernel/diagnostics.js";

export const dslDiagnostics = defineDiagnosticCatalog(
  {
    "PH-DEF-FIELD-OPTION-UNSUPPORTED": {
      severity: "error",
      phase: "definition",
      meaning:
        "A field use contains an option its builder or its position does not support",
    },
    "PH-DEF-TYPE-AS-FIELD": {
      severity: "error",
      phase: "definition",
      meaning: "A named type is used as a field without ph.ref",
    },
    "PH-DEF-NAME-INVALID": {
      severity: "error",
      phase: "definition",
      meaning:
        "An authored GraphQL type, field, or enum value name is lexically invalid or reserved",
    },
    "PH-DEF-FIELD-INVALID": {
      severity: "error",
      phase: "definition",
      meaning:
        "A field position holds a value that is neither a field use nor a named type",
    },
    "PH-DEF-REFERENCE-TARGET-INVALID": {
      severity: "error",
      phase: "definition",
      meaning:
        "A ph.ref target is not a named type: a field use, another reference, undefined, or an anonymous input",
    },
    "PH-DEF-ENUM-VALUES-INVALID": {
      severity: "error",
      phase: "definition",
      meaning:
        "An enum declares no values, a duplicate value, or a reserved value",
    },
    "PH-DEF-UNION-MEMBERS-INVALID": {
      severity: "error",
      phase: "definition",
      meaning:
        "A union declares no members, a duplicate member, or a member that is not a ph.object",
    },
    "PH-DEF-IMPLEMENTS-INVALID": {
      severity: "error",
      phase: "definition",
      meaning:
        "An object or an interface implements something that is not a ph.interface, or the same interface twice",
    },
    "PH-SCALAR-FACTORY-AS-FIELD": {
      severity: "error",
      phase: "definition",
      meaning:
        "A scalar field-use factory is used as a field without being called",
    },
    "PH-SCALAR-INTERNAL": {
      severity: "error",
      phase: "definition",
      meaning:
        "A field uses a catalog scalar that only the reactor host declares, such as JSONObject",
    },
    "PH-SCALAR-DEFINITION-INVALID": {
      severity: "error",
      phase: "definition",
      meaning:
        "ph.scalar received a value that is not a scalar definition of this release's format",
    },
  },
  kernelDiagnostics,
);

export type DslDiagnosticCode = keyof typeof dslDiagnostics.codes;
