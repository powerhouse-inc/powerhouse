import { useNodeActions, useNodeById } from "@powerhousedao/reactor-browser";
import type { PHDocument } from "@powerhousedao/shared/document-model";
import { useState } from "react";
import { twMerge } from "tailwind-merge";
import { ToolbarInput } from "./toolbar-input.js";

/**
 * Toolbar control for displaying and renaming the current document.
 *
 * By default, the component renders the document name as a clickable heading.
 * When clicked, it switches to an inline input. Submitting the input renames
 * both the node and the corresponding drive node entry.
 */
export function ToolbarName(props: {
  document?: PHDocument | undefined;
  inputClassName?: string;
  titleClassName?: string;
}) {
  const { document, inputClassName, titleClassName } = props;
  const [isEditing, setIsEditing] = useState(false);
  const node = useNodeById(document?.header.id);
  const { onRenameNode, onRenameDriveNodes } = useNodeActions();

  const documentName = document?.header.name;
  const documentId = document?.header.id;

  const activateEditing = () => setIsEditing(true);
  const cancelEditing = () => setIsEditing(false);

  const onSubmit = (newName: string) => {
    cancelEditing();
    if (!documentId || !node) return;

    Promise.all([
      onRenameNode(newName, node),
      onRenameDriveNodes(newName, documentId),
    ]).catch(console.error);
  };

  if (!documentName) return null;

  if (isEditing)
    return (
      <ToolbarInput
        className={inputClassName}
        onSubmit={onSubmit}
        onCancel={cancelEditing}
        defaultValue={documentName}
        aria-label="Document name"
      />
    );

  return (
    <h1
      className={twMerge(
        "cursor-pointer text-sm font-medium text-muted-foreground hover:hover-effect",
        titleClassName,
      )}
      onClick={activateEditing}
      title={"Click to edit"}
    >
      {documentName}
    </h1>
  );
}
