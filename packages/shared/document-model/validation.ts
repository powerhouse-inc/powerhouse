import { constantCase, pascalCase } from "change-case";
import type { DocumentOperations } from "./operations.js";
import type {
  CodeExample,
  DocumentModelGlobalState,
  ModuleSpecification,
  OperationErrorSpecification,
  OperationSpecification,
  ValidationError,
} from "./types.js";

/**
 * Reserved operation names from base reducer (core/actions.ts).
 * These names cannot be used for custom operations.
 */
export const RESERVED_OPERATION_NAMES = [
  "UNDO",
  "REDO",
  "PRUNE",
  "LOAD_STATE",
  "SET_NAME",
  "SET_PREFERRED_EDITOR",
  "NOOP",
] as const;

export type ReservedOperationName = (typeof RESERVED_OPERATION_NAMES)[number];

/**
 * Operation names become the literal action `type` string at runtime and the
 * key for codegen's action union. They must be SCREAMING_SNAKE_CASE so the
 * generated TypeScript is valid.
 */
export const OPERATION_NAME_PATTERN = /^[A-Z][A-Z0-9_]*$/;

export function isValidOperationNameFormat(name: string): boolean {
  return OPERATION_NAME_PATTERN.test(name);
}

/**
 * Check if name conflicts with base reducer actions (case-insensitive).
 */
export function isReservedOperationName(name: string): boolean {
  return RESERVED_OPERATION_NAMES.includes(
    name.toUpperCase() as ReservedOperationName,
  );
}

/**
 * Get all operation names from all modules in the latest specification.
 * Returns names in uppercase for case-insensitive comparison.
 */
export function getAllOperationNames(
  state: DocumentModelGlobalState,
  excludeOperationId?: string,
): string[] {
  const latestSpec = state.specifications[state.specifications.length - 1];
  if (!latestSpec) return [];

  const names: string[] = [];
  for (const module of latestSpec.modules) {
    for (const operation of module.operations) {
      if (excludeOperationId && operation.id === excludeOperationId) continue;
      if (operation.name) names.push(operation.name.toUpperCase());
    }
  }
  return names;
}

/**
 * Validate operation name is not reserved or duplicate. Throws on failure.
 *
 * @param name - The operation name to validate
 * @param state - The document model global state
 * @param excludeOperationId - Optional operation ID to exclude (for rename validation)
 * @throws Error if the name is reserved or a duplicate
 */
export function validateOperationName(
  name: string,
  state: DocumentModelGlobalState,
  excludeOperationId?: string,
): void {
  if (!name) return; // Empty names handled by existing validation

  if (!isValidOperationNameFormat(name)) {
    const suggestion = constantCase(name);
    const hint =
      suggestion &&
      suggestion !== name &&
      isValidOperationNameFormat(suggestion)
        ? ` Did you mean "${suggestion}"?`
        : "";
    throw new Error(
      `Operation name "${name}" is invalid. Names must be SCREAMING_SNAKE_CASE (matching ${OPERATION_NAME_PATTERN.source}).${hint}`,
    );
  }

  const upperName = name.toUpperCase();

  if (isReservedOperationName(name)) {
    throw new Error(
      `Operation name "${name}" is reserved. Please use a different name.`,
    );
  }

  const existingNames = getAllOperationNames(state, excludeOperationId);
  if (existingNames.includes(upperName)) {
    throw new Error(
      `Operation name "${name}" is already used by another operation. Operation names must be unique across all modules.`,
    );
  }
}

export function validateInitialState(
  initialState: string,
  allowEmptyState = false,
): ValidationError[] {
  const errors: ValidationError[] = [];

  if (allowEmptyState && initialState === "") return errors;

  try {
    const state = JSON.parse(initialState) as object;

    if (!allowEmptyState && !Object.keys(state).length) {
      errors.push({
        message: "Initial state cannot be empty",
        details: {
          initialState,
        },
      });
    }
  } catch {
    errors.push({
      message: "Invalid initial state",
      details: {
        initialState,
      },
    });
  }

  return errors;
}

export function validateStateSchemaName(
  schema: string,
  documentName: string,
  scope = "",
  allowEmptySchema = true,
): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!allowEmptySchema && !schema) {
    errors.push({
      message: "State schema is required",
      details: {
        schema,
      },
    });

    return errors;
  }

  if (allowEmptySchema && !schema) return errors;

  const expectedTypeName = `${pascalCase(documentName)}${pascalCase(scope)}State`;

  // Use regex to match exact type name definition
  // Pattern matches: type TypeName followed by whitespace, {, @, or end of string
  // This ensures we match "type TodoState" but NOT "type TodoState2"
  const typePattern = new RegExp(
    `\\btype\\s+${expectedTypeName}(?:\\s|\\{|@|$)`,
  );

  if (!typePattern.test(schema)) {
    errors.push({
      message: `Invalid state schema name. Expected type ${expectedTypeName}`,
      details: {
        schema,
      },
    });
  }

  return errors;
}

export function validateModules(
  modules: ModuleSpecification[],
): ValidationError[] {
  const errors: ValidationError[] = [];
  if (!modules.length) {
    errors.push({
      message: "Modules are required",
      details: {
        modules,
      },
    });
  }

  const modulesError = modules.reduce<ValidationError[]>(
    (acc, mod) => [...acc, ...validateModule(mod)],
    [],
  );

  return [...errors, ...modulesError];
}

export function validateModule(mod: ModuleSpecification): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!mod.name) {
    errors.push({
      message: "Module name is required",
      details: {
        module: mod,
      },
    });
  }

  if (!mod.operations.length) {
    errors.push({
      message: "Module operations are required",
      details: {
        module: mod,
      },
    });
  }

  const operationErrors = mod.operations.reduce<ValidationError[]>(
    (acc, operation) => [...acc, ...validateModuleOperation(operation)],
    [],
  );

  return [...errors, ...operationErrors];
}

export function validateModuleOperation(
  operation: OperationSpecification,
): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!operation.name) {
    errors.push({
      message: "Operation name is required",
      details: {
        operation,
      },
    });
  }

  if (!operation.schema) {
    errors.push({
      message: "Operation schema is required",
      details: {
        operation,
      },
    });
  }

  return errors;
}

/**
 * Find a module in the latest specification by id, or throw. Reducers that
 * mutate-by-id should call this up front so an unknown id fails loudly
 * instead of silently no-opping.
 */
export function findModuleOrThrow(
  state: DocumentModelGlobalState,
  moduleId: string,
): ModuleSpecification {
  const latestSpec = state.specifications[state.specifications.length - 1];
  const mod = latestSpec?.modules.find((m) => m.id === moduleId);
  if (!mod) {
    throw new Error(
      `Module "${moduleId}" not found in the latest specification`,
    );
  }
  return mod;
}

/**
 * Find an operation in the latest specification by id, or throw. Same
 * rationale as findModuleOrThrow — reducers that target an operation must
 * fail loudly when the operation doesn't exist.
 */
export function findOperationOrThrow(
  state: DocumentModelGlobalState,
  operationId: string,
): OperationSpecification {
  const latestSpec = state.specifications[state.specifications.length - 1];
  if (latestSpec) {
    for (const mod of latestSpec.modules) {
      const op = mod.operations.find((o) => o.id === operationId);
      if (op) return op;
    }
  }
  throw new Error(
    `Operation "${operationId}" not found in the latest specification`,
  );
}

/**
 * Find an operation error by id across all operations in the latest
 * specification, or throw. Same rationale as findOperationOrThrow.
 */
export function findOperationErrorOrThrow(
  state: DocumentModelGlobalState,
  errorId: string,
): OperationErrorSpecification {
  const latestSpec = state.specifications[state.specifications.length - 1];
  if (latestSpec) {
    for (const mod of latestSpec.modules) {
      for (const op of mod.operations) {
        const error = op.errors.find((e) => e.id === errorId);
        if (error) return error;
      }
    }
  }
  throw new Error(
    `Operation error "${errorId}" not found in the latest specification`,
  );
}

/**
 * Find an operation example (code example) by id across all operations in the
 * latest specification, or throw.
 */
export function findOperationExampleOrThrow(
  state: DocumentModelGlobalState,
  exampleId: string,
): CodeExample {
  const latestSpec = state.specifications[state.specifications.length - 1];
  if (latestSpec) {
    for (const mod of latestSpec.modules) {
      for (const op of mod.operations) {
        const example = op.examples.find((e) => e.id === exampleId);
        if (example) return example;
      }
    }
  }
  throw new Error(
    `Operation example "${exampleId}" not found in the latest specification`,
  );
}

/**
 * Assert no module in the latest specification already uses `id`. Modules are
 * targeted by id by the setter/delete/reorder reducers, so a duplicate id makes
 * those operations ambiguous.
 */
export function assertModuleIdUnique(
  state: DocumentModelGlobalState,
  id: string,
): void {
  const latestSpec = state.specifications[state.specifications.length - 1];
  if (latestSpec?.modules.some((m) => m.id === id)) {
    throw new Error(`Module "${id}" already exists in the latest specification`);
  }
}

/**
 * Assert no operation in the latest specification already uses `id`. Operations
 * are targeted by id across all modules, so the id must be unique document-wide.
 */
export function assertOperationIdUnique(
  state: DocumentModelGlobalState,
  id: string,
): void {
  const latestSpec = state.specifications[state.specifications.length - 1];
  const exists = latestSpec?.modules.some((m) =>
    m.operations.some((o) => o.id === id),
  );
  if (exists) {
    throw new Error(
      `Operation "${id}" already exists in the latest specification`,
    );
  }
}

export function validateOperations(operations: DocumentOperations) {
  const errors: ValidationError[] = [];
  const scopes = Object.keys(operations);

  for (const scope of scopes) {
    const scopeOperations = operations[scope];
    if (!scopeOperations) {
      continue;
    }
    const ops = scopeOperations.sort((a, b) => a.index - b.index);

    let opIndex = -1;

    for (let i = 0; i < ops.length; i++) {
      opIndex = opIndex + 1 + ops[i].skip;
      if (ops[i].index !== opIndex) {
        errors.push({
          message: `Invalid operation index ${ops[i].index} at position ${i}`,
          details: {
            position: i,
            operation: ops[i],
            scope: ops[i].action.scope,
          },
        });
      }
    }
  }

  return errors;
}
