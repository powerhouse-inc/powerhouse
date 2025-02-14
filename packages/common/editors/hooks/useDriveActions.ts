import { FILE, UiNode } from "@powerhousedao/design-system";
import { EditorDispatch } from "document-model/document";
import { generateId } from "document-model/utils";
import { DocumentDriveAction, actions } from "document-models/document-drive";
import { useMemo } from "react";

function createDriveActions(
  dispatch: EditorDispatch<DocumentDriveAction>,
  selectedNode: UiNode | null,
) {
  return {
    onAddFolder: (
      name: string,
      parentFolder = selectedNode?.kind === FILE ? undefined : selectedNode?.id,
      id = generateId(),
    ) => {
      dispatch(
        actions.addFolder({
          id,
          name,
          parentFolder,
        }),
      );
    },
    deleteNode: (id: string) => {
      dispatch(actions.deleteNode({ id }));
    },
    renameNode: (id: string, name: string) => {
      dispatch(actions.updateNode({ id, name }));
    },
    moveNode(src: UiNode, target: UiNode) {
      if (target.kind === FILE || src.parentFolder === target.id) return;
      dispatch(
        actions.moveNode({
          srcFolder: src.id,
          targetParentFolder: target.id,
        }),
      );
    },
  };
}

export function useDriveActions(
  dispatch: EditorDispatch<DocumentDriveAction>,
  selectedNode: UiNode | null,
) {
  return useMemo(
    () => createDriveActions(dispatch, selectedNode),
    [dispatch, selectedNode],
  );
}
