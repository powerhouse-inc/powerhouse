// The controls every editor's own header carries in place of Connect's
// document toolbar: a way back out, and undo/redo.
import {
  getPHStore,
  useDocumentById,
  usePHNavigation,
  useSearchParams,
  useSetSelectedNode,
} from "@powerhousedao/reactor-browser";
import {
  baseReducerVersion,
  undo,
  type Action,
  type Operation,
  type PHDocument,
} from "@powerhousedao/shared/document-model";
import { useEffect, useRef, useState } from "react";
import { Button, IconButton } from "./controls.js";
import { Icon } from "./icons.js";
import {
  canUndoOn3,
  editedSince,
  effectiveOperations,
  headIndex,
  isRetractionDocument,
  planRetraction,
  planUndo,
  redoActions,
  retractions,
  type UndoPolicy,
} from "./undo-plan.js";
import { ITEM_PARAM } from "./url-param.js";

/** Back where the user came from, else to the studio's root. */
export function BackButton(props: { documentId: string; label?: string }) {
  const navigation = usePHNavigation();
  const setSelectedNode = useSetSelectedNode();
  const item = useSearchParams()[ITEM_PARAM];
  const close = () => {
    if (navigation.closeOpened?.()) return;
    // A deep link has no entry to return to; its parent is the hidden home folder.
    setSelectedNode(undefined, { search: { [ITEM_PARAM]: item } });
  };
  return (
    <Button size="sm" variant="ghost" className="-ml-1" onClick={close}>
      <Icon name="back" className="h-3.5 w-3.5" />
      {props.label ?? "Back"}
    </Button>
  );
}

const NO_SKIP: UndoPolicy = { skip: new Set() };

function protocolVersion(document: PHDocument): number {
  try {
    return baseReducerVersion(document.header);
  } catch {
    return 1;
  }
}

const PAGE = 500;

// Documents in the cache carry no history, so undo reads it when pressed.
async function globalHistory(documentId: string): Promise<Operation[]> {
  const client = getPHStore()?.reactorClient;
  if (!client) return [];
  let page = await client.getOperations(
    documentId,
    { branch: "main", scopes: ["global"] },
    undefined,
    { cursor: "", limit: PAGE },
  );
  const all = [...page.results];
  while (page.next && page.results.length > 0) {
    page = await page.next();
    all.push(...page.results);
  }
  return all;
}

// The document's CREATE_DOCUMENT when the cache holds it.
function cachedCreation(document: PHDocument): Operation | undefined {
  const operations: Record<string, Operation[] | undefined> =
    document.operations;
  return operations.document?.at(0);
}

// The document's CREATE_DOCUMENT, from the cache or else read: a header from
// an older Switchboard carries no protocol versions.
async function creation(document: PHDocument): Promise<Operation | undefined> {
  const cached = cachedCreation(document);
  if (cached) return cached;
  const client = getPHStore()?.reactorClient;
  if (!client) return undefined;
  const page = await client.getOperations(
    document.header.id,
    { branch: "main", scopes: ["document"] },
    undefined,
    { cursor: "0", limit: 1 },
  );
  return page.results.at(0);
}

// Whether undo retracts rows (base-reducer 3); undefined while a header
// without a version leaves it to a CREATE_DOCUMENT the cache does not hold.
function knownRetraction(
  document: PHDocument | undefined,
): boolean | undefined {
  if (!document) return undefined;
  const create = cachedCreation(document);
  if (document.header.protocolVersions?.["base-reducer"] === undefined) {
    if (!create) return undefined;
  }
  return isRetractionDocument(document.header, create);
}

// Text fields keep the browser's own undo.
function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT"
  );
}

export function UndoRedo(props: { documentId: string; policy?: UndoPolicy }) {
  const [document, dispatch] = useDocumentById(props.documentId);
  const policy = props.policy ?? NO_SKIP;
  const known = knownRetraction(document);
  const [read, setRead] = useState<{ documentId: string; value: boolean }>();
  const retraction =
    known ??
    (read?.documentId === props.documentId ? read.value : undefined) ??
    false;
  // On base-reducer 3 undo reads its target from the history, which the
  // cache doesn't hold.
  const [canUndoTargeted, setCanUndoTargeted] = useState(false);
  const canUndo = retraction
    ? canUndoTargeted
    : Object.values(document?.header.revision ?? {}).some(Boolean);
  // Edits undone here, newest last: the reactor keeps no clipboard to redo
  // from. Any other edit after `head` voids them. On base-reducer 3 an entry
  // holds the RETRACTs the undo sent, which redo retracts by id, so the
  // edit's own rows come back.
  const [undone, setUndone] = useState<Action[][]>([]);
  const head = useRef(-1);
  const own = useRef(new Set<string>());
  // One undo or redo at a time: a second press plans from the same history.
  const busy = useRef(false);

  const send = (list: Action[]) =>
    new Promise<void>((resolve, reject) =>
      dispatch(
        list,
        (errors) => reject(errors[0]),
        () => resolve(),
      ),
    );
  const stale = (history: Operation[]) =>
    editedSince(
      history.filter((op) => !own.current.has(op.action.id)),
      head.current,
      policy,
    );
  // Moves `head` past what was sent, and says whether anything landed after
  // `since`: a batch whose later action failed still applied the ones before.
  const settle = async (since: number) => {
    head.current = headIndex(await globalHistory(props.documentId));
    return head.current > since;
  };
  const run = (task: () => Promise<void>) => {
    if (!document || busy.current) return;
    busy.current = true;
    task()
      .catch(() => undefined)
      .finally(() => {
        busy.current = false;
      });
  };

  const retractionNow = async (): Promise<boolean> =>
    known ?? isRetractionDocument(document!.header, await creation(document!));

  // Base-reducer 3: RETRACT the last edit's rows.
  const retractUndo = () =>
    run(async () => {
      const history = await globalHistory(props.documentId);
      const targets = planRetraction(history, policy);
      if (!targets) return;
      const sent = retractions(targets);
      const keep = !stale(history);
      try {
        await send(sent);
      } finally {
        if (await settle(headIndex(history))) {
          setUndone((list) => [...(keep ? list : []), sent]);
        }
      }
    });

  const dispatchUndo = () =>
    run(async () => {
      const history = await globalHistory(props.documentId);
      const plan = planUndo(
        effectiveOperations(history, protocolVersion(document!)),
        policy,
      );
      if (!plan) return;
      const keep = !stale(history);
      try {
        await send([
          ...Array.from({ length: plan.undos }, () => undo()),
          ...plan.replay,
        ]);
      } finally {
        if (await settle(headIndex(history))) {
          setUndone((list) => [...(keep ? list : []), plan.undone]);
        }
      }
    });
  const doUndo = () => {
    if (known === false) return dispatchUndo();
    if (known === true) return retractUndo();
    if (!document || busy.current) return;
    void retractionNow()
      .then((onRetraction) => (onRetraction ? retractUndo() : dispatchUndo()))
      .catch((error: unknown) => {
        console.error("Failed to read the base-reducer version:", error);
      });
  };
  const doRedo = () =>
    run(async () => {
      const last = undone.at(-1);
      if (!last) return;
      const onRetraction = await retractionNow();
      const history = await globalHistory(props.documentId);
      if (stale(history)) {
        setUndone([]);
        return;
      }
      const again = onRetraction
        ? retractions(last.map((action) => action.id))
        : redoActions(last);
      for (const action of again) own.current.add(action.id);
      try {
        await send(again);
      } finally {
        if (await settle(headIndex(history))) {
          setUndone((list) => list.slice(0, -1));
        }
      }
    });

  // Read by the key handler and the effects, which don't rerun for them.
  const latest = useRef({ doUndo, doRedo, stale, retractionNow, policy });
  useEffect(() => {
    latest.current = { doUndo, doRedo, stale, retractionNow, policy };
  });

  // An edit made elsewhere voids what is left to redo.
  const revision = JSON.stringify(document?.header.revision ?? {});
  const pending = undone.length > 0;
  useEffect(() => {
    if (!pending || busy.current) return;
    let active = true;
    void globalHistory(props.documentId).then((history) => {
      if (active && !busy.current && latest.current.stale(history)) {
        setUndone([]);
      }
    });
    return () => {
      active = false;
    };
  }, [revision, pending, props.documentId]);
  const hasDocument = document !== undefined;
  useEffect(() => {
    if (!hasDocument || known !== undefined) return;
    let active = true;
    const documentId = props.documentId;
    void latest.current
      .retractionNow()
      .then((value) => {
        if (active) setRead({ documentId, value });
      })
      .catch((error: unknown) => {
        console.error("Failed to read the base-reducer version:", error);
      });
    return () => {
      active = false;
    };
  }, [hasDocument, known, props.documentId]);
  useEffect(() => {
    if (!retraction) return;
    let active = true;
    void globalHistory(props.documentId)
      .then((history) => {
        if (active) {
          setCanUndoTargeted(canUndoOn3(history, latest.current.policy));
        }
      })
      .catch((error: unknown) => {
        console.error("Failed to read undo availability:", error);
      });
    return () => {
      active = false;
    };
  }, [revision, retraction, props.documentId]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
      if (isEditable(event.target)) return;
      const key = event.key.toLowerCase();
      if (key === "z" && !event.shiftKey) {
        event.preventDefault();
        event.stopPropagation();
        latest.current.doUndo();
      } else if ((key === "z" && event.shiftKey) || key === "y") {
        event.preventDefault();
        event.stopPropagation();
        latest.current.doRedo();
      }
    };
    // Capture, so Connect's own shortcut doesn't undo a second time.
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);

  return (
    <span className="flex items-center">
      <IconButton
        icon="undo"
        label="Undo"
        disabled={!canUndo}
        onClick={doUndo}
      />
      <IconButton
        icon="redo"
        label="Redo"
        disabled={undone.length === 0}
        onClick={doRedo}
      />
    </span>
  );
}
