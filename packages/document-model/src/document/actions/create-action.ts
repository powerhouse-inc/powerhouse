import { ZodError } from "zod";
import type { Action } from "../types.js";
import { generateId } from "../utils/crypto.js";
import {
  InvalidActionInputError,
  InvalidActionInputZodError,
} from "../utils/errors.js";

/**
 * Helper function to be used by action creators.
 *
 * @remarks
 * Creates an action with the given type and input properties. The input
 * properties default to an empty object.
 *
 * @typeParam A - Type of the action to be returned.
 *
 * @param type - The type of the action.
 * @param input - The input properties of the action.
 * @param attachments - The attachments included in the action.
 * @param validator - The validator to use for the input properties.
 * @param scope - The scope of the action, can either be 'global' or 'local'.
 * @param skip - The number of operations to skip before this new action is applied.
 *
 * @throws Error if the type is empty or not a string.
 *
 * @returns The new action.
 */
export function createAction<TAction extends Action>(
  type: TAction["type"],
  input?: TAction["input"],
  attachments?: TAction["attachments"],
  validator?: () => { parse(v: unknown): TAction["input"] },
  scope: Action["scope"] = "global",
): TAction {
  if (!type) throw new Error("Empty action type");
  if (typeof type !== "string")
    throw new Error(`Invalid action type: ${JSON.stringify(type)}`);

  const action: Action = {
    id: generateId(),
    timestampUtcMs: new Date().toISOString(),
    type,
    input,
    scope,
  };

  if (attachments) action.attachments = attachments;

  try {
    validator?.().parse(action.input);
  } catch (error) {
    if (error instanceof ZodError) {
      throw new InvalidActionInputZodError(error.issues);
    }
    throw new InvalidActionInputError(error);
  }

  return action as TAction;
}
