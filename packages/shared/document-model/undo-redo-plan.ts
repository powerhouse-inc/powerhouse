import type { Action } from "./actions.js";
import { redo, retract, undo } from "./actions.js";
import type { BaseReducerCapabilities } from "./base-reducer-protocol.js";
import {
  assertNever,
  createdCapabilities,
  optionalBaseReducerCapabilities,
} from "./base-reducer-protocol.js";
import type { PHDocumentHeader } from "./documents.js";
import { NoUndoRedoTargetError } from "./errors.js";
import type { CreateDocumentActionInput } from "./types.js";

/** The action ids a retraction-model UNDO and REDO on a scope would retract. */
export type UndoRedoTargets = {
  undoTarget?: string;
  redoTarget?: string;
};

/** Whether an UNDO or a REDO of one scope would succeed now. */
export type UndoRedoAvailability = {
  canUndo: boolean;
  canRedo: boolean;
};

/** An older host serves no header versions; CREATE_DOCUMENT carries them. */
export function undoCapabilitiesOf(
  header: PHDocumentHeader,
  createInput?: Partial<CreateDocumentActionInput>,
): BaseReducerCapabilities | undefined {
  return (
    optionalBaseReducerCapabilities(header) ?? createdCapabilities(createInput)
  );
}

/** Whether undo resolves a target before it can be planned. */
export function undoNeedsTargets(caps: BaseReducerCapabilities): boolean {
  switch (caps.undo) {
    case "retraction":
      return true;
    case "skip":
    case "noop-chain":
      return false;
    default:
      return assertNever(caps.undo, "undo model");
  }
}

/** What a client submits, signed by its author; throws NoUndoRedoTargetError when nothing is retractable. */
export function undoRedoActions(
  caps: BaseReducerCapabilities,
  type: "UNDO" | "REDO",
  scope: string,
  targets: UndoRedoTargets | undefined,
): Action[] {
  switch (caps.undo) {
    case "skip":
    case "noop-chain":
      return [type === "UNDO" ? undo(1, scope) : redo(1, scope)];
    case "retraction": {
      const target =
        type === "UNDO" ? targets?.undoTarget : targets?.redoTarget;
      if (target === undefined) {
        throw new NoUndoRedoTargetError(type, scope);
      }
      return [retract(target, scope)];
    }
    default:
      return assertNever(caps.undo, "undo model");
  }
}

/** Below the retraction model reads serve no clipboard: undo is approximate. */
export function undoRedoAvailabilityOf(
  caps: BaseReducerCapabilities,
  targets: UndoRedoTargets | undefined,
  revision: number,
  readable: boolean,
): UndoRedoAvailability {
  switch (caps.undo) {
    case "skip":
    case "noop-chain":
      return { canUndo: readable && revision > 0, canRedo: false };
    case "retraction":
      return {
        canUndo: targets?.undoTarget !== undefined,
        canRedo: targets?.redoTarget !== undefined,
      };
    default:
      return assertNever(caps.undo, "undo model");
  }
}

/** Runs `run` after every earlier call with the same key has settled. */
export function serializeByKey<T>(
  chains: Map<string, Promise<unknown>>,
  key: string,
  run: () => Promise<T>,
): Promise<T> {
  const next = (chains.get(key) ?? Promise.resolve())
    .catch(() => undefined)
    .then(run);
  chains.set(key, next);
  void next
    .catch(() => undefined)
    .finally(() => {
      if (chains.get(key) === next) chains.delete(key);
    });
  return next;
}
