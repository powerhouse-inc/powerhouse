import { type DocumentModelState } from "document-model";

/**
 * Validation result for DocumentModelState code generation requirements
 */
export interface DocumentModelStateValidationResult {
  /** Whether the DocumentModelState is valid for code generation */
  isValid: boolean;
  /** Array of validation error messages if validation fails */
  errors: string[];
}

/**
 * Validates that a DocumentModelState has all required properties for successful code generation.
 *
 * @param documentModelState - The DocumentModelState to validate
 * @returns Validation result with isValid flag and error messages
 */
export function validateDocumentModelState(
  documentModelState: DocumentModelState,
): DocumentModelStateValidationResult {
  const errors: string[] = [];

  // Validate top-level required properties
  if (
    !documentModelState.id ||
    typeof documentModelState.id !== "string" ||
    documentModelState.id.trim() === ""
  ) {
    errors.push('Property "id" is required and must be a non-empty string');
  }

  if (
    !documentModelState.name ||
    typeof documentModelState.name !== "string" ||
    documentModelState.name.trim() === ""
  ) {
    errors.push('Property "name" is required and must be a non-empty string');
  }

  if (
    !documentModelState.extension ||
    typeof documentModelState.extension !== "string" ||
    documentModelState.extension.trim() === ""
  ) {
    errors.push(
      'Property "extension" is required and must be a non-empty string',
    );
  }

  // Validate specifications array
  if (
    !Array.isArray(documentModelState.specifications) ||
    documentModelState.specifications.length === 0
  ) {
    errors.push(
      'Property "specifications" is required and must be a non-empty array',
    );
    return { isValid: false, errors };
  }

  // Get the latest specification (used by code generation)
  const latestSpec =
    documentModelState.specifications[
      documentModelState.specifications.length - 1
    ];

  if (!latestSpec) {
    errors.push("Latest specification is missing or invalid");
    return { isValid: false, errors };
  }

  // Validate state structure
  if (!latestSpec.state) {
    errors.push('Latest specification must have a "state" property');
    return { isValid: false, errors };
  }

  // Validate global state (required)
  if (!latestSpec.state.global) {
    errors.push('Latest specification state must have a "global" property');
  } else {
    const globalState = latestSpec.state.global;

    if (typeof globalState.schema !== "string") {
      errors.push('Global state "schema" must be a string');
    }

    if (typeof globalState.initialValue !== "string") {
      errors.push('Global state "initialValue" must be a string');
    }

    // Check if schema is non-empty but initialValue is missing
    const hasNonEmptySchema =
      globalState.schema &&
      globalState.schema.trim() !== "" &&
      globalState.schema.includes("{");
    if (
      hasNonEmptySchema &&
      (!globalState.initialValue || globalState.initialValue.trim() === "")
    ) {
      errors.push(
        "Global state has a defined schema but is missing an initial value",
      );
    }
  }

  // Validate local state (required - templates directly access it)
  if (!latestSpec.state.local) {
    errors.push('Latest specification state must have a "local" property');
  } else {
    const localState = latestSpec.state.local;

    if (typeof localState.schema !== "string") {
      errors.push('Local state "schema" must be a string');
    }

    if (typeof localState.initialValue !== "string") {
      errors.push('Local state "initialValue" must be a string');
    }

    // Check if schema is non-empty but initialValue is missing
    const hasNonEmptySchema =
      localState.schema &&
      localState.schema.trim() !== "" &&
      localState.schema.includes("{");
    if (
      hasNonEmptySchema &&
      (!localState.initialValue || localState.initialValue.trim() === "")
    ) {
      errors.push(
        "Local state has a defined schema but is missing an initial value",
      );
    }
  }

  // Validate modules array (required but can be empty)
  if (!Array.isArray(latestSpec.modules)) {
    errors.push('Latest specification must have a "modules" array');
  } else {
    // Validate that there's at least one module
    if (latestSpec.modules.length === 0) {
      errors.push("Latest specification must have at least one module defined");
    }

    latestSpec.modules.forEach((module, moduleIndex) => {
      if (
        !module.name ||
        typeof module.name !== "string" ||
        module.name.trim() === ""
      ) {
        errors.push(
          `Module at index ${moduleIndex} must have a non-empty "name" property`,
        );
      }

      if (!Array.isArray(module.operations)) {
        errors.push(
          `Module "${module.name || `at index ${moduleIndex}`}" must have an "operations" array`,
        );
      } else {
        // Validate that each module has at least one operation
        if (module.operations.length === 0) {
          errors.push(
            `Module "${module.name || `at index ${moduleIndex}`}" must have at least one operation defined`,
          );
        }

        module.operations.forEach((operation, operationIndex) => {
          const operationId = operation.name || `at index ${operationIndex}`;
          const moduleId = module.name || `at index ${moduleIndex}`;

          // operation.name is required for code generation
          if (
            !operation.name ||
            typeof operation.name !== "string" ||
            operation.name.trim() === ""
          ) {
            errors.push(
              `Operation ${operationId} in module "${moduleId}" must have a non-empty "name" property`,
            );
          }

          // operation.schema can be null or string (required property)
          if (
            operation.schema !== null &&
            typeof operation.schema !== "string"
          ) {
            errors.push(
              `Operation "${operationId}" in module "${moduleId}" must have a "schema" that is either null or a string`,
            );
          }

          // operation.scope is optional - template uses `a.scope || "global"` fallback
          if (
            operation.scope !== undefined &&
            typeof operation.scope !== "string"
          ) {
            errors.push(
              `Operation "${operationId}" in module "${moduleId}" must have a "scope" that is a string if provided`,
            );
          }

          // operation.errors is required - templates directly access it
          if (!Array.isArray(operation.errors)) {
            errors.push(
              `Operation "${operationId}" in module "${moduleId}" must have an "errors" array`,
            );
          }
        });
      }
    });
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}
