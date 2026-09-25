// The controls every editor's own header carries in place of Connect's
// document toolbar: a way back out, and undo/redo.
import {
  setSelectedNode,
  useDocumentById,
} from "@powerhousedao/reactor-browser";
import { redo, undo } from "@powerhousedao/shared/document-model";
import { Button, IconButton } from "./controls.js";
import { Icon } from "./icons.js";

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

export function UndoRedo(props: { documentId: string }) {
  const [document, dispatch] = useDocumentById(props.documentId);
  const canUndo = Object.values(document?.header.revision ?? {}).some(Boolean);
  const canRedo = (document?.clipboard.length ?? 0) > 0;
  return (
    <span className="flex items-center">
      <IconButton
        icon="undo"
        label="Undo"
        disabled={!canUndo}
        onClick={() => dispatch(undo())}
      />
      <IconButton
        icon="redo"
        label="Redo"
        disabled={!canRedo}
        onClick={() => dispatch(redo())}
      />
    </span>
  );
}
