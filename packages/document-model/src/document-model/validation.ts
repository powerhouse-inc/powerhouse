import { pascalCase } from "change-case";
import type {
  ModuleSpecification,
  OperationSpecification,
  ValidationError,
} from "document-model";
import type { DocumentModelGlobalState } from "./types.js";

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
  "NOOP",
] as const;

export type ReservedOperationName = (typeof RESERVED_OPERATION_NAMES)[number];

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
