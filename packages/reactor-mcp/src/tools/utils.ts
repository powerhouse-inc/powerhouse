import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { camelCase } from "change-case";
import type {
  Action,
  DocumentModelModule,
  Operation,
} from "@powerhousedao/shared/document-model";
import { baseActions } from "@powerhousedao/shared/document-model";
import type { z } from "zod";
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

  // Validate the operation using the action creator. TODO: Use document model exported validators directly
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

/** The scope each base action must carry; `null` means any scope of the document. */
const BASE_ACTION_SCOPES: Record<string, string | null> = {
  SET_NAME: "global",
  SET_PREFERRED_EDITOR: "header",
  UNDO: null,
  REDO: null,
  NOOP: null,
};

/** How many steps an UNDO or REDO input asks for; one when it names none. */
export function undoRedoCount(input: unknown): number {
  return countInput(input) ?? 1;
}

function countInput(input: unknown): number | undefined {
  if (typeof input === "number") return input;
  if (
    typeof input === "object" &&
    input !== null &&
    "count" in input &&
    typeof input.count === "number"
  ) {
    return input.count;
  }
  return undefined;
}

/**
 * Builds a document-model base action (SET_NAME, SET_PREFERRED_EDITOR, UNDO,
 * REDO, NOOP) with its action creator. Returns `null` for any other type.
 */
export function createBaseAction(
  type: string,
  input: unknown,
  scope: string,
): { action: Action | null; errors: string[] } | null {
  if (!Object.hasOwn(BASE_ACTION_SCOPES, type)) return null;

  const expectedScope = BASE_ACTION_SCOPES[type];
  if (expectedScope !== null && scope !== expectedScope) {
    return {
      action: null,
      errors: [
        `Action scope "${scope}" does not match operation scope "${expectedScope}"`,
      ],
    };
  }

  try {
    switch (type) {
      case "SET_NAME":
        return {
          action: baseActions.setName(input as string | { name: string }),
          errors: [],
        };
      case "SET_PREFERRED_EDITOR":
        return {
          action: baseActions.setPreferredEditor(
            input as string | null | { preferredEditor: string | null },
          ),
          errors: [],
        };
      case "UNDO":
        return {
          action: baseActions.undo(countInput(input), scope),
          errors: [],
        };
      case "REDO":
        return {
          action: baseActions.redo(countInput(input), scope),
          errors: [],
        };
      default:
        return { action: baseActions.noop(scope), errors: [] };
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : JSON.stringify(e);
    return { action: null, errors: [`Input validation error: ${message}`] };
  }
}
