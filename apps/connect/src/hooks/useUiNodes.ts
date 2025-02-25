import { useModal } from '#components/modal/index';
import { useReadModeContext } from '#context/read-mode';
import { useFileNodeDocument } from '#store/document-drive';
import {
    useFilteredDocumentModels,
    useGetDocumentModelModule,
} from '#store/document-model';
import { getNodeOptions } from '#utils/drive-sections';
import { makeNodeSlugFromNodeName } from '#utils/slug';
import {
    AddLocalDriveInput,
    AddRemoteDriveInput,
    CLOUD,
    DRIVE,
    FILE,
    FOLDER,
    LOCAL,
    PUBLIC,
    SharingType,
    SUCCESS,
    toast,
    UiDriveNode,
    UiFileNode,
    UiFolderNode,
    UiNode,
    useUiNodesContext,
} from '@powerhousedao/design-system';
import { DocumentDriveDocument, ReadDrive } from 'document-drive';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useDocumentDriveById } from './useDocumentDriveById';
import { useDocumentDriveServer } from './useDocumentDriveServer';
import { useOpenSwitchboardLink } from './useOpenSwitchboardLink';
import { useUserPermissions } from './useUserPermissions';

export function useUiNodes() {
    const { showModal } = useModal();
    const { t } = useTranslation();
    const uiNodesContext = useUiNodesContext();
    const {
        selectedDriveNode,
        driveNodes,
        selectedParentNode,
        setSelectedNode,
        getParentNode,
    } = uiNodesContext;
    const readModeContext = useReadModeContext();
    const documentDriveServer = useDocumentDriveServer();
    const {
        addFolder,
        addFile,
        renameNode,
        deleteNode,
        addDrive,
        addRemoteDrive,
        deleteDrive,
        renameDrive,
        setDriveAvailableOffline,
        setDriveSharingType,
        copyNode,
        moveNode,
        getSyncStatus,
        removeTrigger,
        addTrigger,
        registerNewPullResponderTrigger,
    } = documentDriveServer;
    const selectedDocumentDrive = useDocumentDriveById(selectedDriveNode?.id);
    const openSwitchboardLink = useOpenSwitchboardLink(selectedDriveNode?.id);
    const userPermissions = useUserPermissions();
    const nodeOptions = getNodeOptions();
    const documentModels = useFilteredDocumentModels();
    const getDocumentModelModule = useGetDocumentModelModule();
    const fileNodeDocument = useFileNodeDocument({
        ...uiNodesContext,
        ...documentDriveServer,
        ...readModeContext,
    });

    const makeUiDriveNode = useCallback(
        async (drive: DocumentDriveDocument | ReadDrive) => {
            const isReadDrive = 'readContext' in drive;
            const { id, name, icon, slug } = drive.state.global;
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

    const makeUiDriveNodes = useCallback(
        async (documentDrives: DocumentDriveDocument[]) => {
            return Promise.all(documentDrives.map(makeUiDriveNode));
        },
        [makeUiDriveNode],
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

    const onDeleteNode = useCallback(
        (uiNode: UiFileNode | UiFolderNode) => {
            showModal('deleteItem', {
                uiNode,
                onDelete: async closeModal => {
                    closeModal();

                    const i18nKey =
                        uiNode.kind === FOLDER
                            ? 'notifications.deleteFolderSuccess'
                            : 'notifications.fileDeleteSuccess';

                    const parentNode = getParentNode(uiNode);

                    await deleteNode(uiNode.driveId, uiNode.id);

                    setSelectedNode(parentNode);

                    toast(t(i18nKey), { type: 'connect-deleted' });
                },
            });
        },
        [deleteNode, getParentNode, setSelectedNode, showModal, t],
    );

    const onDeleteDrive = useCallback(
        (uiDriveNode: UiDriveNode) => {
            showModal('deleteDriveModal', {
                uiDriveNode,
                onDelete: async closeModal => {
                    closeModal();
                    await deleteDrive(uiDriveNode.id);

                    setSelectedNode(driveNodes[0]);

                    toast(t('notifications.deleteDriveSuccess'), {
                        type: 'connect-deleted',
                    });
                },
            });
        },
        [deleteDrive, driveNodes, setSelectedNode, showModal, t],
    );

    const onAddLocalDrive = useCallback(
        async (data: AddLocalDriveInput) => {
            try {
                const newDrive = await addDrive(
                    {
                        global: {
                            name: data.name,
                            id: undefined,
                            icon: null,
                            slug: null,
                        },
                        local: {
                            availableOffline: data.availableOffline,
                            sharingType: data.sharingType.toLowerCase(),
                            listeners: [],
                            triggers: [],
                        },
                    },
                    data.app,
                );

                toast(t('notifications.addDriveSuccess'), {
                    type: 'connect-success',
                });

                const newDriveNode = await makeUiDriveNode(newDrive);

                setSelectedNode(newDriveNode);
            } catch (e) {
                console.error(e);
            }
        },
        [addDrive, makeUiDriveNode, setSelectedNode, t],
    );

    const onAddRemoteDrive = useCallback(
        async (data: AddRemoteDriveInput) => {
            try {
                const newDrive = await addRemoteDrive(data.url, {
                    sharingType: data.sharingType,
                    availableOffline: data.availableOffline,
                    listeners: [
                        {
                            block: true,
                            callInfo: {
                                data: data.url,
                                name: 'switchboard-push',
                                transmitterType: 'SwitchboardPush',
                            },
                            filter: {
                                branch: ['main'],
                                documentId: ['*'],
                                documentType: ['*'],
                                scope: ['global'],
                            },
                            label: 'Switchboard Sync',
                            listenerId: '1',
                            system: true,
                        },
                    ],
                    triggers: [],
                    pullInterval: 3000,
                });

                toast(t('notifications.addDriveSuccess'), {
                    type: 'connect-success',
                });

                const newDriveNode = await makeUiDriveNode(newDrive);

                setSelectedNode(newDriveNode);
            } catch (e) {
                console.error(e);
            }
        },
        [addRemoteDrive, makeUiDriveNode, setSelectedNode, t],
    );

    const showAddDriveModal = useCallback(
        () =>
            showModal('addDriveModal', {
                onAddLocalDrive,
                onAddRemoteDrive,
            }),
        [onAddLocalDrive, onAddRemoteDrive, showModal],
    );

    const onRenameDrive = useCallback(
        async (uiDriveNode: UiDriveNode, newName: string) => {
            await renameDrive(uiDriveNode.id, newName);
        },
        [renameDrive],
    );

    const onChangeSharingType = useCallback(
        async (uiDriveNode: UiDriveNode, newSharingType: SharingType) => {
            await setDriveSharingType(uiDriveNode.id, newSharingType);
        },
        [setDriveSharingType],
    );

    const onChangeAvailableOffline = useCallback(
        async (uiDriveNode: UiDriveNode, newAvailableOffline: boolean) => {
            await setDriveAvailableOffline(uiDriveNode.id, newAvailableOffline);
        },
        [setDriveAvailableOffline],
    );

    const showDriveSettingsModal = useCallback(
        (uiDriveNode: UiDriveNode) => {
            showModal('driveSettings', {
                uiDriveNode,
                onRenameDrive,
                onDeleteDrive,
                onChangeSharingType,
                onChangeAvailableOffline,
            });
        },
        [
            onChangeAvailableOffline,
            onChangeSharingType,
            onDeleteDrive,
            onRenameDrive,
            showModal,
        ],
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

    const driveNodesBySharingType = useMemo(
        () =>
            driveNodes.reduce<Record<SharingType, UiDriveNode[]>>(
                (acc, driveNode) => {
                    acc[driveNode.sharingType].push(driveNode);
                    return acc;
                },
                {
                    [PUBLIC]: [],
                    [CLOUD]: [],
                    [LOCAL]: [],
                },
            ),
        [driveNodes],
    );

    return useMemo(
        () => ({
            ...documentDriveServer,
            ...uiNodesContext,
            ...userPermissions,
            ...selectedDocumentDrive,
            ...fileNodeDocument,
            nodeOptions,
            driveNodesBySharingType,
            documentModels,
            onAddFolder,
            onAddFile,
            onCopyNode,
            onMoveNode,
            onRenameNode,
            onDuplicateNode,
            onDeleteNode,
            onDeleteDrive,
            makeUiDriveNodes,
            onAddAndSelectNewFolder,
            showAddDriveModal,
            showDriveSettingsModal,
            openSwitchboardLink,
            onAddTrigger,
            onRemoveTrigger,
            onAddInvalidTrigger,
            getDocumentModelModule,
        }),
        [
            documentDriveServer,
            uiNodesContext,
            userPermissions,
            selectedDocumentDrive,
            fileNodeDocument,
            nodeOptions,
            driveNodesBySharingType,
            documentModels,
            onAddFolder,
            onAddFile,
            onCopyNode,
            onMoveNode,
            onRenameNode,
            onDuplicateNode,
            onDeleteNode,
            onDeleteDrive,
            makeUiDriveNodes,
            onAddAndSelectNewFolder,
            showAddDriveModal,
            showDriveSettingsModal,
            openSwitchboardLink,
            onAddTrigger,
            onRemoveTrigger,
            onAddInvalidTrigger,
            getDocumentModelModule,
        ],
    );
}

export type TUiNodes = ReturnType<typeof useUiNodes>;
