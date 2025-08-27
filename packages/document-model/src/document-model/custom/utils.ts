import { pascalCase } from "change-case";
import type {
  ModuleSpecification,
  OperationSpecification,
} from "document-model";
import type { ValidationError } from "../../document/types.js";

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

  const expectedTypeName = `type ${pascalCase(documentName)}${pascalCase(scope)}State`;

  if (!schema.includes(expectedTypeName)) {
    errors.push({
      message: `Invalid state schema name. Expected ${expectedTypeName}`,
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
