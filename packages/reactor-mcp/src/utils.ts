import { camelCase } from "change-case";
import { type Action, type DocumentModelModule } from "document-model";
import { type Operation } from "document-model/document-model/gen/schema/types";

/**
 * Validates a document model action against the document model state.
 * Checks if the action type is valid and the input structure is correct.
 */
export function validateDocumentModelAction(
  documentModelModule: DocumentModelModule,
  action: Action,
): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  const documentModelState = documentModelModule.documentModel;

  // Get the latest specification
  if (
    !documentModelState.specifications ||
    documentModelState.specifications.length === 0
  ) {
    errors.push("Document model has no specifications");
    return { isValid: false, errors };
  }

  const latestSpec =
    documentModelState.specifications[
      documentModelState.specifications.length - 1
    ];

  // Search through modules to find the operation that matches the action type (in SCREAMING_SNAKE_CASE)
  let operation: Operation | null = null;

  for (const module of latestSpec.modules) {
    const foundOp = module.operations.find((op) => op.name === action.type);
    if (foundOp) {
      operation = foundOp;
      break;
    }
  }

  if (!operation) {
    errors.push(
      `Operation "${action.type}" is not defined in any module of the document model`,
    );
    return { isValid: false, errors };
  }

  // Convert action type from SCREAMING_SNAKE_CASE to camelCase to match action creators
  const camelCaseActionType = camelCase(action.type);

  // Check if action creator exists in documentModelModule.actions
  const actionCreator = documentModelModule.actions[camelCaseActionType];

  if (!actionCreator) {
    errors.push(
      `Action creator "${camelCaseActionType}" for action type "${action.type}" is not defined in documentModelDocumentModelModule.actions`,
    );
    return { isValid: false, errors };
  }

  // Validate the operation using the action creator
  let inputError: Error | null = null;
  try {
    actionCreator(action.input);
  } catch (e) {
    inputError = e instanceof Error ? e : new Error(JSON.stringify(e));
  }

  if (inputError) {
    errors.push(`Input validation error: ${inputError.message}`);
  }

  // Validate scope if operation defines one
  if (operation.scope && action.scope !== operation.scope) {
    errors.push(
      `Action scope "${action.scope}" does not match operation scope "${operation.scope}"`,
    );
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}
