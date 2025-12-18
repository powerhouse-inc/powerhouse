import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { camelCase } from "change-case";
import type { Action, DocumentModelModule, Operation } from "document-model";
import { baseActions } from "document-model";
import { isDocumentAction } from "document-model/core";
import { ZodError, type z } from "zod";
import { prettifyError } from "zod/v4";
import type { ResolveZodSchema, ToolSchema } from "./types.js";

export class InvalidToolOutputError extends Error {
  constructor(zodError: z.ZodError) {
    super("Invalid tool output\n" + zodError.message);
    this.name = "InvalidToolOutputError";
    this.cause = zodError;
  }
}

/**
 * Creates a tool with a callback function that handles the tool execution,
 * ensuring the output is valid and errors are handled and returned correctly.
 * @param tool The tool schema to wrap.
 * @param toolCallback The callback function to execute when the tool is called.
 * @returns A CallToolResult with structuredContent if OutputSchema is defined or content if undefined. If the
 * callback throws an error, the result will have isError set to true and the error message in the content.
 */
export function toolWithCallback<T extends ToolSchema>(
  tool: T,
  toolCallback: (
    args: ResolveZodSchema<T["inputSchema"]>,
  ) =>
    | ResolveZodSchema<T["outputSchema"]>
    | Promise<ResolveZodSchema<T["outputSchema"]>>,
) {
  const wrappedCallback = async (
    args: ResolveZodSchema<T["inputSchema"]>,
  ): Promise<CallToolResult> => {
    try {
      const result = await toolCallback(args);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result),
          },
        ],
        structuredContent: result,
      } as const satisfies CallToolResult;
    } catch (error) {
      const errorString =
        error instanceof Error ? error.message : String(error);
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `Error: ${errorString}`,
          },
        ],
      } as const satisfies CallToolResult;
    }
  };
  return {
    ...tool,
    callback: wrappedCallback,
  };
}

export function isZodError(err: unknown): err is ZodError {
  return Boolean(
    err && (err instanceof ZodError || (err as ZodError).name === "ZodError"),
  );
}

export function validateDocumentModelAction(
  documentModelModule: DocumentModelModule,
  action: Action,
): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  const globalState = documentModelModule.documentModel.global;

  // Get the latest specification
  if (!globalState.specifications || globalState.specifications.length === 0) {
    errors.push("Document model has no specifications");
    return { isValid: false, errors };
  }

  const latestSpec =
    globalState.specifications[globalState.specifications.length - 1];

  // Search through modules to find the operation that matches the action type (in SCREAMING_SNAKE_CASE)
  let operation: (Operation & { scope: string }) | null = null;

  for (const module of latestSpec.modules) {
    const unsafeOperationOrActionOrSomething = module.operations.find(
      (op) => op.name === action.type,
    ) as unknown as Operation & { scope: string };
    if (unsafeOperationOrActionOrSomething) {
      operation = unsafeOperationOrActionOrSomething;
      break;
    }
  }

  const isBaseAction = isDocumentAction(action);

  if (!isBaseAction && !operation) {
    errors.push(
      `Operation "${action.type}" is not defined in any module of the document model`,
    );
    return { isValid: false, errors };
  }

  // Convert action type from SCREAMING_SNAKE_CASE to camelCase to match action creators
  const camelCaseActionType = camelCase(action.type);

  // Check if action creator exists in documentModelModule.actions
  const actionCreator = isBaseAction
    ? (baseActions as Record<string, (...args: any[]) => Action>)[
        camelCaseActionType
      ]
    : documentModelModule.actions[camelCaseActionType];

  if (!actionCreator) {
    errors.push(
      `Action creator "${camelCaseActionType}" for action type "${action.type}" not found`,
    );
    return { isValid: false, errors };
  }

  // Validate the operation using the action creator. TODO: Use document model exported validators directly
  let inputError: string | null = null;
  try {
    actionCreator(action.input);
  } catch (e) {
    inputError = isZodError(e)
      ? prettifyError(e)
      : e instanceof Error
        ? e.message
        : typeof e === "string"
          ? e
          : JSON.stringify(e);
  }

  if (inputError) {
    errors.push(`Input validation error: ${inputError}`);
  }

  // Validate scope if operation defines one
  if (operation && operation.scope && action.scope !== operation.scope) {
    errors.push(
      `Action scope "${action.scope}" does not match operation scope "${operation.scope}"`,
    );
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}
