// The controls every editor's own header carries in place of Connect's
// document toolbar: a way back out, and undo/redo.
import {
  setSelectedNode,
  useDocumentById,
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
  editedSince,
  effectiveOperations,
  headIndex,
  planUndo,
  redoActions,
  type UndoPolicy,
} from "./undo-plan.js";

export function BackButton(props: { label?: string }) {
  return (
    <Button
      size="sm"
      variant="ghost"
      className="-ml-1"
      onClick={() => setSelectedNode(undefined)}
    >
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
  const client = window.ph?.reactorClient;
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
  const canUndo = Object.values(document?.header.revision ?? {}).some(Boolean);
  // Edits undone here, newest last: the reactor keeps no clipboard to redo
  // from. Any other edit after `head` voids them.
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
  const settle = async () => {
    head.current = headIndex(await globalHistory(props.documentId));
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

  const doUndo = () =>
    run(async () => {
      const history = await globalHistory(props.documentId);
      const plan = planUndo(
        effectiveOperations(history, protocolVersion(document!)),
        policy,
      );
      if (!plan) return;
      const keep = !stale(history);
      await send([
        ...Array.from({ length: plan.undos }, () => undo()),
        ...plan.replay,
      ]);
      await settle();
      setUndone((list) => [...(keep ? list : []), plan.undone]);
    });
  const doRedo = () =>
    run(async () => {
      const last = undone.at(-1);
      if (!last) return;
      if (stale(await globalHistory(props.documentId))) {
        setUndone([]);
        return;
      }
      const again = redoActions(last);
      for (const action of again) own.current.add(action.id);
      await send(again);
      await settle();
      setUndone((list) => list.slice(0, -1));
    });

  // Read by the key handler and the effects, which don't rerun for them.
  const latest = useRef({ doUndo, doRedo, stale });
  useEffect(() => {
    latest.current = { doUndo, doRedo, stale };
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
