import { makeNodeSlugFromNodeName } from '#utils';
import {
    DRIVE,
    FILE,
    PUBLIC,
    SUCCESS,
    type UiDriveNode,
    type UiFileNode,
    type UiFolderNode,
} from '@powerhousedao/design-system';
import {
    getDriveSharingType,
    useSelectedParentNodeId,
    useSetSelectedNodeId,
} from '@powerhousedao/reactor-browser';
import { type DocumentDriveDocument, type ReadDrive } from 'document-drive';
import { useCallback, useMemo } from 'react';
import { useDocumentDriveServer } from './useDocumentDriveServer.js';

export function useMakeUiDriveNode() {
    const { getSyncStatus } = useDocumentDriveServer();
    const makeUiDriveNode = useCallback(
        async (drive: DocumentDriveDocument | ReadDrive) => {
            const isReadDrive = 'readContext' in drive;
            const id = drive.id;
            console.log('rendering useMakeUiDriveNode...', id);
            const { name, icon } = drive.state.global;
            const { slug } = drive;
            const { sharingType: _sharingType, availableOffline } = !isReadDrive
                ? drive.state.local
                : { sharingType: PUBLIC, availableOffline: false };
            const sharingType = getDriveSharingType(drive);
            const driveSyncStatus = !isReadDrive
                ? await getSyncStatus(id, sharingType)
                : undefined;

            // TODO: rempve this after integration in design-system
            const normalizedDriveSyncStatus =
                driveSyncStatus === 'INITIAL_SYNC'
                    ? 'SYNCING'
                    : driveSyncStatus;

            const driveNode: UiDriveNode = {
                id,
                name,
                slug: slug || null,
                kind: DRIVE,
                children: [],
                nodeMap: {},
                sharingType,
                syncStatus: normalizedDriveSyncStatus,
                availableOffline,
                icon,
                parentFolder: null,
                driveId: id,
            };

            const nodes = drive.state.global.nodes.map(n => {
                const node = {
                    ...n,
                    slug: makeNodeSlugFromNodeName(n.name),
                    driveId: id,
                    parentFolder: n.parentFolder || id,
                    kind: n.kind.toUpperCase(),
                    syncStatus: normalizedDriveSyncStatus,
                    sharingType,
                };

                if (node.kind === DRIVE) {
                    throw new Error('Drive nodes should not be nested');
                }

                if (node.kind === FILE) {
                    return node as UiFileNode;
                }

                return {
                    ...node,
                    children: [],
                } as UiFolderNode;
            });

            for (const node of nodes) {
                driveNode.nodeMap[node.id] = node;
            }

            // eslint-disable-next-line @typescript-eslint/await-thenable
            for await (const node of nodes) {
                if (node.kind === FILE) {
                    const fileSyncStatus = !isReadDrive
                        ? await getSyncStatus(
                              node.synchronizationUnits[0].syncId,
                              sharingType,
                          )
                        : undefined;

                    // TODO: rempve this after integration in design-system
                    const normalizedFileSyncStatus =
                        fileSyncStatus === 'INITIAL_SYNC'
                            ? 'SYNCING'
                            : fileSyncStatus;

                    node.syncStatus = normalizedFileSyncStatus;
                }

                if (node.parentFolder === id) {
                    driveNode.children.push(node);
                    continue;
                }
                const parent = driveNode.nodeMap[node.parentFolder];

                if (parent.kind === FILE) {
                    throw new Error(
                        `Parent node ${node.parentFolder} is a file, not a folder`,
                    );
                }

                parent.children.push(node);

                if (node.syncStatus !== SUCCESS) {
                    parent.syncStatus = node.syncStatus;
                }
            }

            return driveNode;
        },
        [getSyncStatus],
    );

    return makeUiDriveNode;
}

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
    const { addFolder, addFile, renameNode, copyNode, moveNode } =
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
