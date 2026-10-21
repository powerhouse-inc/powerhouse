import {
  useDocumentById,
  useReactorClient,
  type IReactorBrowserClient,
} from "@powerhousedao/reactor-browser";
import {
  optionalBaseReducerCapabilities,
  redo,
  undo,
  undoNeedsTargets,
  type PHDocument,
} from "@powerhousedao/shared/document-model";
import {
  defaultTo,
  filter,
  hasAtLeast,
  isTruthy,
  merge,
  pipe,
  prop,
  values,
} from "remeda";
import { useEffect, useState } from "react";

type UndoRedoAvailability = { canUndo: boolean; canRedo: boolean };

const UNAVAILABLE: UndoRedoAvailability = { canUndo: false, canRedo: false };

/** The scope `undo()` and `redo()` target by default. */
const UNDO_SCOPE = "global";

/**
 * Whether undo and redo go through the reactor client: when they resolve a
 * target, and on a header without protocol versions (a light client of an
 * older Switchboard), whose client reads the version itself.
 */
function undoesThroughClient(
  client: IReactorBrowserClient | undefined,
  document: PHDocument | undefined,
): boolean {
  if (!client || !document) return false;
  const caps = optionalBaseReducerCapabilities(document.header);
  return caps === undefined || undoNeedsTargets(caps);
}

// The latest availability read per document, shared by every hook asking at
// the same revision: on base-reducer 3 a read derives the scope to resolve targets.
const availabilityReads = new WeakMap<
  IReactorBrowserClient,
  Map<string, { revision: string; read: Promise<UndoRedoAvailability> }>
>();

function readAvailability(
  client: IReactorBrowserClient,
  documentId: string,
  revision: string,
): Promise<UndoRedoAvailability> {
  let reads = availabilityReads.get(client);
  if (!reads) {
    reads = new Map();
    availabilityReads.set(client, reads);
  }
  const cached = reads.get(documentId);
  if (cached?.revision === revision) return cached.read;
  const entry = { revision, read: Promise.resolve(UNAVAILABLE) };
  entry.read = client
    .undoRedoAvailability(documentId, UNDO_SCOPE)
    .catch((error: unknown) => {
      console.error("Failed to read undo and redo availability:", error);
      // A failure is not cached, so the next ask reads again.
      if (reads.get(documentId) === entry) reads.delete(documentId);
      return UNAVAILABLE;
    });
  reads.set(documentId, entry);
  return entry.read;
}

// The undo or redo in flight per document, so presses run one after another
// in press order.
const pendingPresses = new WeakMap<
  IReactorBrowserClient,
  Map<string, Promise<unknown>>
>();

function queuePress(
  client: IReactorBrowserClient,
  documentId: string,
  press: () => Promise<unknown>,
  failure: string,
): void {
  let presses = pendingPresses.get(client);
  if (!presses) {
    presses = new Map();
    pendingPresses.set(client, presses);
  }
  const queue = presses;
  const prior = queue.get(documentId);
  const started = prior
    ? prior.then(press)
    : new Promise((resolve) => resolve(press()));
  const run = started.catch((error: unknown) => {
    console.error(failure, error);
  });
  queue.set(documentId, run);
  void run.finally(() => {
    if (queue.get(documentId) === run) queue.delete(documentId);
  });
}

/**
 * Undo and redo through the reactor client, so the author signs the RETRACT
 * it submits. Availability is read when the global or document revision
 * changes, and presses run one at a time. Returns undefined unless the
 * document is on base-reducer 3 or its header carries no protocol versions.
 */
export function useBaseReducer3UndoRedo(document: PHDocument | undefined) {
  const client = useReactorClient();
  const documentId = undoesThroughClient(client, document)
    ? document?.header.id
    : undefined;
  const revision = `${document?.header.revision[UNDO_SCOPE] ?? 0}:${document?.header.revision.document ?? 0}`;
  const [availability, setAvailability] = useState<{
    documentId?: string;
    value: UndoRedoAvailability;
  }>({ value: UNAVAILABLE });

  useEffect(() => {
    if (!client || !documentId) return;
    let cancelled = false;
    void readAvailability(client, documentId, revision).then((value) => {
      if (!cancelled) setAvailability({ documentId, value });
    });
    return () => {
      cancelled = true;
    };
  }, [client, documentId, revision]);

  if (!client || !documentId) return undefined;
  const { canUndo, canRedo } =
    availability.documentId === documentId ? availability.value : UNAVAILABLE;
  return {
    canUndo,
    canRedo,
    undo: () =>
      queuePress(
        client,
        documentId,
        () => client.undo(documentId, UNDO_SCOPE),
        "Failed to undo:",
      ),
    redo: () =>
      queuePress(
        client,
        documentId,
        () => client.redo(documentId, UNDO_SCOPE),
        "Failed to redo:",
      ),
  };
}

/**
 * Checks whether a document has at least one non-zero revision count.
 *
 * Revision scopes are dynamic document-model keys, so this checks the values of
 * the document's revision object instead of relying on a fixed list of scope
 * names.
 */
function hasRevisions(document: PHDocument | undefined) {
  return pipe(
    prop(document, "header", "revision"),
    defaultTo({}),
    values(),
    filter(isTruthy),
    hasAtLeast(1),
  );
}

/**
 * Returns undo state and an undo dispatcher for a document.
 *
 * On base-reducer 3, and on a header without protocol versions, both come from
 * the reactor client. Otherwise `canUndo` is true when the document has at
 * least one non-zero revision count across any revision scope, and undo
 * dispatches UNDO.
 */
export function useUndo(documentId: string | undefined) {
  const [document, dispatch] = useDocumentById(documentId);
  const client = useBaseReducer3UndoRedo(document);
  if (client) {
    return { canUndo: client.canUndo, undo: client.undo };
  }

  return {
    canUndo: hasRevisions(document),
    undo: () => dispatch(undo()),
  };
}

/**
 * Returns redo state and a redo dispatcher for a document.
 *
 * On base-reducer 3, and on a header without protocol versions, both come from
 * the reactor client. Otherwise `canRedo` is true when the document clipboard
 * contains at least one operation that can be reapplied, and redo dispatches
 * REDO.
 */
export function useRedo(documentId: string | undefined) {
  const [document, dispatch] = useDocumentById(documentId);
  const client = useBaseReducer3UndoRedo(document);
  if (client) {
    return { canRedo: client.canRedo, redo: client.redo };
  }

  return {
    canRedo: hasAtLeast(document?.clipboard ?? [], 1),
    redo: () => dispatch(redo()),
  };
}

/**
 * Returns combined undo and redo state for a document.
 */
export function useDocumentUndoRedo(documentId?: string) {
  const undoProps = useUndo(documentId);
  const redoProps = useRedo(documentId);
  return merge(undoProps, redoProps);
}
