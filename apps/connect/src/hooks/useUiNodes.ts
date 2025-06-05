import {
    useSelectedParentNodeId,
    useSetSelectedNodeId,
} from '@powerhousedao/reactor-browser';
import { useCallback, useMemo } from 'react';
import { useDocumentDriveServer } from './useDocumentDriveServer.js';

export function useDebugHandlers() {
    const { removeTrigger, addTrigger, registerNewPullResponderTrigger } =
        useDocumentDriveServer();

    const onAddTrigger = useCallback(
        async (uiNodeDriveId: string) => {
            const url = window.prompt('url') || '';

            const pullResponderTrigger = await registerNewPullResponderTrigger(
                uiNodeDriveId,
                url,
                { pullInterval: 6000 },
            );
            await addTrigger(uiNodeDriveId, pullResponderTrigger);
        },
        [addTrigger, registerNewPullResponderTrigger],
    );

    const onRemoveTrigger = useCallback(
        async (uiNodeDriveId: string) => {
            const triggerId = window.prompt('triggerId:');

            if (triggerId) {
                await removeTrigger(uiNodeDriveId, triggerId);
            }
        },
        [removeTrigger],
    );

    const onAddInvalidTrigger = useCallback(
        async (uiNodeDriveId: string) => {
            const url = window.prompt('url') || '';

            await addTrigger(uiNodeDriveId, {
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

export function useUiNodes() {
    const selectedParentNodeId = useSelectedParentNodeId();
    const setSelectedNodeId = useSetSelectedNodeId();
    const { addFolder, addFile, renameNode, copyNode, moveNode, deleteNode, getSyncStatusSync } =
        useDocumentDriveServer();

    const onAddFile = useCallback(
        async (
            file: File,
            parentNodeId: string | null,
            driveId: string | null,
        ) => {
            if (!driveId) {
                throw new Error('Drive id is required');
            }
            if (!parentNodeId) {
                throw new Error('Parent node is required');
            }

            const fileName = file.name.replace(/\.zip$/gim, '');

            return await addFile(file, driveId, fileName, parentNodeId);
        },
        [addFile],
    );

    const onAddFolder = useCallback(
        async (
            name: string,
            parentNodeId: string | null,
            driveId: string | null,
        ) => {
            if (!driveId) {
                throw new Error('Drive id is required');
            }
            if (!parentNodeId) {
                throw new Error('Parent node is required');
            }
            return await addFolder(driveId, name, parentNodeId);
        },
        [addFolder],
    );

    const onRenameNode = useCallback(
        async (name: string, nodeId: string, driveId: string) => {
            return await renameNode(driveId, nodeId, name);
        },
        [renameNode],
    );

    const onCopyNode = useCallback(
        async (nodeId: string, targetNodeId: string, driveId: string) => {
            return await copyNode(nodeId, targetNodeId, driveId);
        },
        [copyNode],
    );

    const onMoveNode = useCallback(
        async (nodeId: string, targetNodeId: string, driveId: string) => {
            return await moveNode(nodeId, targetNodeId, driveId);
        },
        [moveNode],
    );

    const onDuplicateNode = useCallback(
        async (nodeId: string, driveId: string) => {
            if (!selectedParentNodeId) return;

            await copyNode(nodeId, selectedParentNodeId, driveId);
        },
        [copyNode, selectedParentNodeId],
    );

    const onAddAndSelectNewFolder = useCallback(
        async (name: string, driveId: string) => {
            if (!name || !selectedParentNodeId) return;

            const newFolder = await onAddFolder(
                name,
                selectedParentNodeId,
                driveId,
            );

            setSelectedNodeId(newFolder.id);
        },
        [onAddFolder, selectedParentNodeId, setSelectedNodeId],
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

export type TUiNodes = ReturnType<typeof useUiNodes>;
