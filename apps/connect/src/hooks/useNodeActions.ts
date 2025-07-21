import { type TNodeActions } from '@powerhousedao/design-system';
import {
    useSelectedParentFolder,
    useSetSelectedNode,
    useUnwrappedSelectedDrive,
    useUnwrappedSelectedFolder,
} from '@powerhousedao/state';
import { type Node } from 'document-drive';
import { useCallback, useMemo } from 'react';
import { useDocumentDriveServer } from './useDocumentDriveServer.js';
export function useDebugHandlers() {
    const { removeTrigger, addTrigger, registerNewPullResponderTrigger } =
        useDocumentDriveServer();

    const onAddTrigger = useCallback(
        async (driveId: string) => {
            const url = window.prompt('url') || '';

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
            const triggerId = window.prompt('triggerId:');

            if (triggerId) {
                await removeTrigger(driveId, triggerId);
            }
        },
        [removeTrigger],
    );

    const onAddInvalidTrigger = useCallback(
        async (driveId: string) => {
            const url = window.prompt('url') || '';

            await addTrigger(driveId, {
                id: 'some-invalid-id',
                type: 'PullResponder',
                data: {
                    interval: '3000',
                    listenerId: 'invalid-listener-id',
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
    const selectedDrive = useUnwrappedSelectedDrive();
    const selectedFolder = useUnwrappedSelectedFolder();
    const selectedParentFolder = useSelectedParentFolder();
    const setSelectedNode = useSetSelectedNode();
    const { addFolder, addFile, renameNode, copyNode, moveNode } =
        useDocumentDriveServer();

    const onAddFile = useCallback(
        async (file: File, parent: Node | undefined) => {
            if (!selectedDrive?.header.id) return;

            const fileName = file.name.replace(/\.zip$/gim, '');

            return await addFile(
                file,
                selectedDrive.header.id,
                fileName,
                parent?.id,
            );
        },
        [addFile, selectedDrive?.header.id],
    );

    const onAddFolder = useCallback(
        async (name: string, parent: { id: string } | undefined) => {
            if (!selectedDrive?.header.id) return;

            return await addFolder(selectedDrive.header.id, name, parent?.id);
        },
        [addFolder, selectedDrive?.header.id],
    );

    const onRenameNode = useCallback(
        async (newName: string, node: Node): Promise<Node | undefined> => {
            if (!selectedDrive?.header.id) return;

            return await renameNode(selectedDrive.header.id, node.id, newName);
        },
        [renameNode, selectedDrive?.header.id],
    );

    const onCopyNode = useCallback(
        async (src: Node, target: Node | undefined) => {
            await copyNode(src, target);
        },
        [copyNode],
    );

    const onMoveNode = useCallback(
        async (src: Node, target: Node | undefined) => {
            await moveNode(src, target);
        },
        [moveNode],
    );

    const onDuplicateNode = useCallback(
        async (src: Node) => {
            await copyNode(src, selectedFolder ?? selectedParentFolder);
        },
        [copyNode, selectedFolder, selectedParentFolder],
    );

    const onAddAndSelectNewFolder = useCallback(
        async (name: string) => {
            if (!name) return;

            const newFolder = await onAddFolder(
                name,
                selectedFolder ?? selectedParentFolder,
            );

            if (newFolder) {
                setSelectedNode(newFolder.id);
            }
        },
        [onAddFolder, selectedFolder, selectedParentFolder, setSelectedNode],
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
