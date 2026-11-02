import { dslDiagnostics } from "../dsl/diagnostic-codes.js";
import { defineDiagnosticCatalog } from "../kernel/diagnostics.js";

export const compilerDiagnostics = defineDiagnosticCatalog(
  {
    "PH-DM-DUPLICATE-ACTION": {
      severity: "error",
      phase: "definition",
      meaning:
        "Two operations derive the same persisted action type, or an operation derives one the document runtime owns",
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
    "PH-DM-DECLARATION-INVALID": {
      severity: "error",
      phase: "definition",
      meaning:
        "A model, module, operation, error, example, version, or family declaration member is absent, malformed, unsupported, or forged",
    },
    "PH-DM-DEFAULT-UNSUPPORTED": {
      severity: "error",
      phase: "definition",
      meaning: "A document state field declares a GraphQL default value",
    },
    "PH-DM-INTERFACE-INVALID": {
      severity: "error",
      phase: "definition",
      meaning:
        "An object or interface does not satisfy an implemented interface's fields or ancestor requirements",
    },
    "PH-DM-INPUT-CYCLE": {
      severity: "error",
      phase: "definition",
      meaning:
        "An input type contains itself through singular non-null input fields, so no finite value satisfies it",
    },
    "PH-DM-TYPE-POSITION-INVALID": {
      severity: "error",
      phase: "definition",
      meaning:
        "An input type is referenced from an output position, or an output type from an input position",
    },
    "PH-DM-INITIAL-VALUE-INVALID": {
      severity: "error",
      phase: "definition",
      meaning:
        "A scope initial value cannot produce a stored JSON string, or its own state validator rejects it",
    },
    "PH-SCALAR-DUPLICATE-NAME": {
      severity: "error",
      phase: "definition",
      meaning: "Two different project scalars of one model claim one name",
    },
  },
  dslDiagnostics,
);

export type CompilerDiagnosticCode = keyof typeof compilerDiagnostics.codes;
