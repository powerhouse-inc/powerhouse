import type { TNodeActions } from "@powerhousedao/design-system";
import {
  addFile,
  addFolder,
  addTrigger,
  copyNode,
  moveNode,
  registerNewPullResponderTrigger,
  removeTrigger,
  renameNode,
  setSelectedNode,
  useSelectedDriveId,
  useSelectedFolder,
  useSelectedParentFolder,
} from "@powerhousedao/reactor-browser";
import type { Node } from "document-drive";
import { useCallback, useMemo } from "react";
export function useDebugHandlers() {
  const onAddTrigger = useCallback(
    async (driveId: string) => {
      const url = window.prompt("url") || "";

      const pullResponderTrigger = await registerNewPullResponderTrigger(
        driveId,
        url,
        { pullInterval: 6000 },
      );
      if (!pullResponderTrigger) return;
      await addTrigger(driveId, pullResponderTrigger);
    },
    [addTrigger, registerNewPullResponderTrigger],
  );

  const onRemoveTrigger = useCallback(
    async (driveId: string) => {
      const triggerId = window.prompt("triggerId:");

      if (triggerId) {
        await removeTrigger(driveId, triggerId);
      }
    },
    [removeTrigger],
  );

  const onAddInvalidTrigger = useCallback(
    async (driveId: string) => {
      const url = window.prompt("url") || "";

      await addTrigger(driveId, {
        id: "some-invalid-id",
        type: "PullResponder",
        data: {
          interval: "3000",
          listenerId: "invalid-listener-id",
          url,
        },
      });
    },
    [addTrigger],
  );

  return {
    onAddTrigger,
    onRemoveTrigger,
    onAddInvalidTrigger,
  };
}

export function useNodeActions(): TNodeActions {
  const selectedFolder = useSelectedFolder();
  const selectedParentFolder = useSelectedParentFolder();
  const selectedDriveId = useSelectedDriveId();

  const onAddFile = useCallback(
    async (file: File, parent: Node | undefined) => {
      if (!selectedDriveId) return;

      const fileName = file.name.replace(/\.zip$/gim, "");

      return await addFile(file, selectedDriveId, fileName, parent?.id);
    },
    [selectedDriveId],
  );

  const onAddFolder = useCallback(
    async (name: string, parent: { id: string } | undefined) => {
      if (!selectedDriveId) return;

      return await addFolder(selectedDriveId, name, parent?.id);
    },
    [selectedDriveId],
  );

  const onRenameNode = useCallback(
    async (newName: string, node: Node): Promise<Node | undefined> => {
      if (!selectedDriveId) return;

      return await renameNode(selectedDriveId, node.id, newName);
    },
    [selectedDriveId],
  );

  const onCopyNode = useCallback(
    async (src: Node, target: Node | undefined) => {
      if (!selectedDriveId) return;
      await copyNode(selectedDriveId, src, target);
    },
    [selectedDriveId],
  );

  const onMoveNode = useCallback(
    async (src: Node, target: Node | undefined) => {
      if (!selectedDriveId) return;
      await moveNode(selectedDriveId, src, target);
    },
    [selectedDriveId],
  );

  const onDuplicateNode = useCallback(
    async (src: Node) => {
      if (!selectedDriveId) return;
      await copyNode(
        selectedDriveId,
        src,
        selectedFolder ?? selectedParentFolder,
      );
    },
    [selectedDriveId, selectedFolder, selectedParentFolder],
  );

  const onAddAndSelectNewFolder = useCallback(
    async (name: string) => {
      if (!name) return;

      const newFolder = await onAddFolder(
        name,
        selectedFolder ?? selectedParentFolder,
      );

      if (newFolder) {
        setSelectedNode(newFolder);
      }
    },
    [onAddFolder, selectedFolder, selectedParentFolder],
  );

  return useMemo(
    () => ({
      onAddFile,
      onAddFolder,
      onRenameNode,
      onCopyNode,
      onMoveNode,
      onDuplicateNode,
      onAddAndSelectNewFolder,
    }),
    [
      onAddFolder,
      onAddFile,
      onCopyNode,
      onMoveNode,
      onRenameNode,
      onDuplicateNode,
      onAddAndSelectNewFolder,
    ],
  );
}
