import type { Action } from "./actions.js";
import { redo, retract, undo } from "./actions.js";
import type { BaseReducerCapabilities } from "./base-reducer-protocol.js";
import {
  assertNever,
  capabilitiesOf,
  resolveBaseReducerVersion,
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

/**
 * An older host serves no header versions; CREATE_DOCUMENT carries them. A
 * number this build does not know runs as the highest it runs.
 */
export function undoCapabilitiesOf(
  header: PHDocumentHeader,
  createInput?: Partial<CreateDocumentActionInput>,
): BaseReducerCapabilities | undefined {
  const version =
    resolveBaseReducerVersion(header.protocolVersions) ??
    resolveBaseReducerVersion(createInput?.protocolVersions);
  return version === undefined ? undefined : capabilitiesOf(version);
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

/**
 * Runs `run` after every earlier call with the same key has settled. A caller
 * whose `signal` aborts stops waiting and rejects with its reason; the key
 * stays held until the earlier calls settle.
 */
export function serializeByKey<T>(
  chains: Map<string, Promise<unknown>>,
  key: string,
  run: () => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  const prior = (chains.get(key) ?? Promise.resolve()).catch(() => undefined);
  const next = (signal ? settledUnlessAborted(prior, signal) : prior).then(
    () => {
      signal?.throwIfAborted();
      return run();
    },
  );
  const tail = signal
    ? Promise.all([prior, next.catch(() => undefined)])
    : next;
  chains.set(key, tail);
  void tail
    .catch(() => undefined)
    .finally(() => {
      if (chains.get(key) === tail) chains.delete(key);
    });
  return next;
}

function settledUnlessAborted(
  prior: Promise<unknown>,
  signal: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(signal.reason as Error);
    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener("abort", onAbort, { once: true });
    void prior.then(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    });
  });
}
