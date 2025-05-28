import {
  type DocumentDriveAction,
  type DocumentDriveDocument,
  type FileNode,
  type FolderNode,
  type Node,
} from "document-drive";
import { type EditorDispatch } from "document-model";
import { useMemo } from "react";
import { FILE } from "../uiNodes/constants.js";
import type { UiFileNode, UiNode } from "../uiNodes/types.js";
import { type IDriveActions, useDriveActions } from "./useDriveActions.js";
import { type IDriveContext, useDriveContext } from "./useDriveContext.js";
import { useUiNodesContext } from "./useUiNodesContext.js";

function toNode(uiNode: UiNode): Node {
  if (uiNode.kind === "DRIVE") {
    throw new Error("Cannot convert drive node to regular node");
  }

  const { id, name, parentFolder, kind } = uiNode;
  if (kind === "FOLDER") {
    return { id, name, parentFolder, kind: "folder" } satisfies FolderNode;
  } else {
    // Remove after ts reset is fixed

    const fileNode = uiNode as UiFileNode;
    return {
      id,
      name,
      parentFolder,
      kind: "file",
      documentType: fileNode.documentType,
    } satisfies FileNode;
  }
}

// Adapter to convert between UiNodes and drive actions
function createUiNodeAdapter(driveActions: IDriveActions) {
  return {
    ...driveActions,

    addFile: (file: File, parentNode: UiNode | null) =>
      driveActions.addFile(file, parentNode?.id),

    addFolder: (name: string, parentFolder = undefined as string | undefined) =>
      driveActions.addFolder(name, parentFolder),

    renameNode: (name: string, node: UiNode) => {
      const converted = toNode(node);
      return driveActions.renameNode(converted.id, name);
    },

    deleteNode: (node: UiNode) => {
      const converted = toNode(node);
      return driveActions.deleteNode(converted.id);
    },

    moveNode: async (src: UiNode, target: UiNode) => {
      if (target.kind === FILE || src.parentFolder === target.id) return;
      const srcNode = toNode(src);
      const targetNode = toNode(target);
      return driveActions.moveNode(srcNode.id, targetNode.id);
    },

    copyNode: (src: UiNode, target: UiNode) => {
      return driveActions.copyNode(src.id, target.id);
    },

    duplicateNode: (node: UiNode) => {
      const converted = toNode(node);
      return driveActions.duplicateNode(converted.id);
    },
  };
}

export function useDriveActionsWithUiNodes(
  document: DocumentDriveDocument,
  dispatch: EditorDispatch<DocumentDriveAction>,
) {
  const { selectedNode, selectedDriveNode, setSelectedNode, getNodeById } =
    useUiNodesContext();

  const _driveContext = useDriveContext();

  const driveContext: IDriveContext = useMemo(
    () => ({
      ..._driveContext,
      selectedNode: selectedNode,
      onSelectNode: (node: UiNode) => {
        _driveContext.selectNode(node);
        setSelectedNode(getNodeById(node.id));
      },
    }),
    [selectedNode, selectedDriveNode?.driveId, setSelectedNode, getNodeById],
  );
  const driveActions = useDriveActions(document, dispatch, driveContext);

  const uiNodeActions = useMemo(
    () => createUiNodeAdapter(driveActions),
    [driveActions],
  );

  return uiNodeActions;
}
