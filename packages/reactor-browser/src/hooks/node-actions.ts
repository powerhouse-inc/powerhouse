import type { Node } from "document-drive";
import {
  addFile,
  addFolder,
  copyNode,
  moveNode,
  renameNode,
} from "../actions/document.js";
import { useFolderById } from "./folder-by-id.js";
import { useSelectedDriveSafe } from "./selected-drive.js";
import { useSelectedFolder } from "./selected-folder.js";
import { setSelectedNode, useSelectedNode } from "./selected-node.js";

function resolveNode(driveId: string, node: Node | undefined) {
  return node?.id !== driveId ? node : undefined;
}

export function useNodeActions() {
  const [selectedDrive] = useSelectedDriveSafe();
  const selectedFolder = useSelectedFolder();
  const selectedNode = useSelectedNode();
  const selectedParentFolder = useFolderById(selectedNode?.parentFolder);
  const selectedDriveId = selectedDrive?.header.id;

  async function onAddFile(file: File, parent: Node | undefined) {
    if (!selectedDriveId) return;

    const fileName = file.name.replace(/\..+/gim, "");

    return addFile(
      file,
      selectedDriveId,
      fileName,
      resolveNode(selectedDriveId, parent)?.id,
    );
  }

  async function onAddFolder(name: string, parent: Node | undefined) {
    if (!selectedDriveId) return;

    return addFolder(
      selectedDriveId,
      name,
      resolveNode(selectedDriveId, parent)?.id,
    );
  }

  async function onRenameNode(
    newName: string,
    node: Node,
  ): Promise<Node | undefined> {
    if (!selectedDriveId) return;

    const resolvedNode = resolveNode(selectedDriveId, node);
    if (!resolvedNode) {
      console.error(`Node ${node.id} not found`);
      return;
    }

    return await renameNode(selectedDriveId, node.id, newName);
  }

  async function onCopyNode(src: Node, target: Node | undefined) {
    if (!selectedDriveId) return;
    const resolvedSrc = resolveNode(selectedDriveId, src);
    if (!resolvedSrc) {
      console.error(`Node ${src.id} not found`);
      return;
    }
    const resolvedTarget = resolveNode(selectedDriveId, target);

    await copyNode(selectedDriveId, resolvedSrc, resolvedTarget);
  }

  async function onMoveNode(src: Node, target: Node | undefined) {
    if (!selectedDriveId) return;

    const resolvedSrc = resolveNode(selectedDriveId, src);
    if (!resolvedSrc) {
      console.error(`Node ${src.id} not found`);
      return;
    }
    const resolvedTarget = resolveNode(selectedDriveId, target);

    // if node is already on target then ignore move
    if (
      (!resolvedTarget?.id && !src.parentFolder) ||
      resolvedTarget?.id === src.parentFolder
    ) {
      return;
    }
    await moveNode(selectedDriveId, resolvedSrc, resolvedTarget);
  }

  async function onDuplicateNode(src: Node) {
    if (!selectedDriveId) return;

    const resolvedSrc = resolveNode(selectedDriveId, src);
    if (!resolvedSrc) {
      console.error(`Node ${src.id} not found`);
      return;
    }

    const target = resolveNode(
      selectedDriveId,
      selectedFolder ?? selectedParentFolder,
    );
    await copyNode(selectedDriveId, resolvedSrc, target);
  }
  async function onAddAndSelectNewFolder(name: string) {
    if (!name) return;
    if (!selectedDriveId) return;

    const resolvedTarget = resolveNode(
      selectedDriveId,
      selectedFolder ?? selectedParentFolder,
    );
    if (!resolvedTarget) return;

    const newFolder = await onAddFolder(name, resolvedTarget);

    if (newFolder) {
      setSelectedNode(newFolder);
    }
  }

  return {
    onAddFile,
    onAddFolder,
    onRenameNode,
    onCopyNode,
    onMoveNode,
    onDuplicateNode,
    onAddAndSelectNewFolder,
  };
}
