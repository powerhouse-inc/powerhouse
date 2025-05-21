import { makeNodeSlugFromNodeName } from '#utils';
import {
    DRIVE,
    FILE,
    FOLDER,
    LOCAL,
    PUBLIC,
    type SharingType,
    SUCCESS,
    type UiDriveNode,
    type UiFileNode,
    type UiFolderNode,
    type UiNode,
} from '@powerhousedao/design-system';
import { useUiNodesContext } from '@powerhousedao/reactor-browser/hooks/useUiNodesContext';
import { type DocumentDriveDocument, type ReadDrive } from 'document-drive';
import { useCallback, useMemo } from 'react';
import { useDocumentDriveServer } from './useDocumentDriveServer.js';

export function useMakeUiDriveNode() {
    const { getSyncStatus } = useDocumentDriveServer();
    const makeUiDriveNode = useCallback(
        async (drive: DocumentDriveDocument | ReadDrive) => {
            const isReadDrive = 'readContext' in drive;
            const id = drive.id;
            const { name, icon } = drive.state.global;
            const { slug } = drive;
            const { sharingType: _sharingType, availableOffline } = !isReadDrive
                ? drive.state.local
                : { sharingType: PUBLIC, availableOffline: false };
            const __sharingType = _sharingType?.toUpperCase();
            const sharingType = (
                __sharingType === 'PRIVATE' ? LOCAL : __sharingType
            ) as SharingType;
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
    const { selectedParentNode, setSelectedNode } = useUiNodesContext();
    const { addFolder, addFile, renameNode, copyNode, moveNode } =
        useDocumentDriveServer();

    const onAddFile = useCallback(
        async (file: File, parentNode: UiNode | null) => {
            if (!parentNode) {
                throw new Error('Parent node is required');
            }
            if (parentNode.kind === FILE) {
                throw new Error('Cannot add file to a file');
            }

            const fileName = file.name.replace(/\.zip$/gim, '');

            return await addFile(
                file,
                parentNode.driveId,
                fileName,
                parentNode.id,
            );
        },
        [addFile],
    );

    const onAddFolder = useCallback(
        async (name: string, parentNode: UiNode | null) => {
            if (!parentNode) {
                throw new Error('Parent node is required');
            }
            if (parentNode.kind === FILE) {
                throw new Error('Cannot add folder to a file');
            }
            return await addFolder(parentNode.driveId, name, parentNode.id);
        },
        [addFolder],
    );

    const onRenameNode = useCallback(
        async (name: string, uiNode: UiNode) => {
            if (uiNode.kind === DRIVE) {
                throw new Error(
                    'Drive can only be renamed from the drive settings modal',
                );
            }
            return await renameNode(uiNode.driveId, uiNode.id, name);
        },
        [renameNode],
    );

    const onCopyNode = useCallback(
        async (uiNode: UiNode, targetNode: UiNode) => {
            if (uiNode.kind === DRIVE) {
                throw new Error('Drive cannot be duplicated');
            }

            await copyNode(uiNode, targetNode);
        },
        [copyNode],
    );

    const onMoveNode = useCallback(
        async (uiNode: UiNode, targetNode: UiNode) => {
            if (uiNode.kind === DRIVE) {
                throw new Error('Drive cannot be moved');
            }

            await moveNode(uiNode, targetNode);
        },
        [moveNode],
    );

    const onDuplicateNode = useCallback(
        async (uiNode: UiNode) => {
            if (!selectedParentNode) return;

            if (uiNode.kind === DRIVE) {
                throw new Error('Drive cannot be duplicated');
            }

            await copyNode(uiNode, selectedParentNode);
        },
        [copyNode, selectedParentNode],
    );

    const onAddAndSelectNewFolder = useCallback(
        async (name: string) => {
            if (!name || !selectedParentNode) return;

            const newFolder = await onAddFolder(name, selectedParentNode);

            setSelectedNode({
                ...newFolder,
                kind: FOLDER,
                slug: makeNodeSlugFromNodeName(newFolder.name),
                parentFolder: selectedParentNode.id,
                syncStatus: selectedParentNode.syncStatus,
                driveId: selectedParentNode.driveId,
                sharingType: selectedParentNode.sharingType,
                children: [],
            });
        },
        [onAddFolder, selectedParentNode, setSelectedNode],
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
