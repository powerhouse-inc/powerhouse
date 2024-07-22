import {
    AddLocalDriveInput,
    AddRemoteDriveInput,
    CLOUD,
    defaultFileOptions,
    defaultFolderOptions,
    DragAndDropHandlers,
    DRIVE,
    FILE,
    FOLDER,
    LOCAL,
    NodeHandlers,
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
import { DocumentDriveDocument } from 'document-model-libs/document-drive';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useModal } from 'src/components/modal';
import { getOptionsForDriveSharingType } from 'src/utils/drive-sections';
import { useDocumentDriveById } from './useDocumentDriveById';
import { useDocumentDriveServer } from './useDocumentDriveServer';
import { useNodeNavigation } from './useNodeNavigation';
import { useOnDropEvent } from './useOnDropEvent';
import { useOpenSwitchboardLink } from './useOpenSwitchboardLink';
import { useUserPermissions } from './useUserPermissions';

export function useUiNodes() {
    const [disableHoverStyles, setDisableHoverStyles] = useState(false);
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
    const onDropEvent = useOnDropEvent();
    const documentDriveServer = useDocumentDriveServer();
    const {
        addFolder,
        renameNode,
        deleteNode,
        addDrive,
        addRemoteDrive,
        deleteDrive,
        renameDrive,
        setDriveAvailableOffline,
        setDriveSharingType,
        copyNode,
        getSyncStatus,
        removeTrigger,
        addTrigger,
        registerNewPullResponderTrigger,
    } = documentDriveServer;
    const selectedDocumentDrive = useDocumentDriveById(selectedDriveNode?.id);
    const openSwitchboardLink = useOpenSwitchboardLink(selectedDriveNode?.id);
    const userPermissions = useUserPermissions();
    useNodeNavigation();

    const makeUiDriveNode = useCallback(
        async (drive: DocumentDriveDocument) => {
            const { id, name, icon, slug } = drive.state.global;
            const { sharingType: _sharingType, availableOffline } =
                drive.state.local;
            const __sharingType = _sharingType?.toUpperCase();
            const sharingType = (
                __sharingType === 'PRIVATE' ? LOCAL : __sharingType
            ) as SharingType;
            const driveSyncStatus = await getSyncStatus(id, sharingType);

            const driveNode: UiDriveNode = {
                id,
                name,
                slug: slug || null,
                kind: DRIVE,
                children: [],
                nodeMap: {},
                sharingType,
                syncStatus: driveSyncStatus,
                availableOffline,
                icon,
                parentFolder: null,
                driveId: id,
            };

            const nodes = drive.state.global.nodes.map(n => {
                const node = {
                    ...n,
                    driveId: id,
                    parentFolder: n.parentFolder || id,
                    kind: n.kind.toUpperCase(),
                    syncStatus: driveSyncStatus,
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

            for await (const node of nodes) {
                if (node.kind === FILE) {
                    node.syncStatus = await getSyncStatus(
                        node.synchronizationUnits[0].syncId,
                        sharingType,
                    );
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
                await addDrive({
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
                });

                toast(t('notifications.addDriveSuccess'), {
                    type: 'connect-success',
                });
            } catch (e) {
                console.error(e);
            }
        },
        [addDrive, t],
    );

    const onAddRemoteDrive = useCallback(
        async (data: AddRemoteDriveInput) => {
            try {
                await addRemoteDrive(data.url, {
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
            } catch (e) {
                console.error(e);
            }
        },
        [addRemoteDrive, t],
    );

    const showAddDriveModal = useCallback(
        (groupSharingType: SharingType) => {
            if (groupSharingType === LOCAL) {
                showModal('addLocalDrive', {
                    onSubmit: onAddLocalDrive,
                });
            } else {
                showModal('addRemoteDrive', {
                    onSubmit: onAddRemoteDrive,
                    sharingType: groupSharingType,
                });
            }
        },
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
                parentFolder: selectedParentNode.id,
                syncStatus: selectedParentNode.syncStatus,
                driveId: selectedParentNode.driveId,
                children: [],
            });
        },
        [onAddFolder, selectedParentNode, setSelectedNode],
    );

    // const onItemOptionsClick: DriveViewProps['onItemOptionsClick'] = async (
    //     item,
    //     option,
    // ) => {
    //     const driveID = item.path.split('/')[0];
    //     switch (option) {
    //         case 'new-folder':
    //             actions.setExpandedItem(item.id, true);
    //             addVirtualNewFolder(item, driveID);
    //             break;
    //         case 'rename':
    //             actions.setItemAction(item.id, 'UPDATE');
    //             break;
    //         case 'delete':
    //             if (
    //                 ['PUBLIC_DRIVE', 'LOCAL_DRIVE', 'CLOUD_DRIVE'].includes(
    //                     item.type,
    //                 )
    //             ) {
    //                 showModal('deleteDriveModal', {
    //                     onCancel: closeModal => closeModal(),
    //                     driveName: item.label,
    //                     onDelete: async closeModal => {
    //                         closeModal();
    //                         await deleteDrive(decodeID(item.id));

    //                         toast(t('notifications.deleteDriveSuccess'), {
    //                             type: 'connect-deleted',
    //                         });
    //                     },
    //                 });
    //             } else {
    //                 showModal('deleteItem', {
    //                     itemId: decodeID(item.id),
    //                     itemName: item.label,
    //                     driveId: decodeID(driveID),
    //                     type: item.type === 'FOLDER' ? 'folder' : 'file',
    //                 });
    //             }
    //             break;
    //         case 'delete-drive':
    //             await deleteDrive(decodeID(item.id));
    //             break;
    //         case 'rename-drive':
    //             await renameDrive(decodeID(item.id), item.label);
    //             break;
    //         case 'change-availability':
    //             await setDriveAvailableOffline(
    //                 decodeID(item.id),
    //                 item.availableOffline,
    //             );
    //             break;
    //         case 'change-sharing-type':
    //             await setDriveSharingType(
    //                 decodeID(item.id),
    //                 item.sharingType?.toLowerCase() as TreeItemSharingType,
    //             );
    //             break;
    //         case 'duplicate':
    //             await onSubmitInput({
    //                 ...item,
    //                 action: 'UPDATE_AND_COPY',
    //             });
    //             break;
    //         case 'remove-trigger': {
    //             // ONLY AVAILABLE FOR DEBUGGING
    //             const triggerId = window.prompt('triggerId:');

    //             if (triggerId) {
    //                 await removeTrigger(decodeID(driveID), triggerId);
    //             }
    //             break;
    //         }
    //         case 'add-trigger': {
    //             // ONLY AVAILABLE FOR DEBUGGING
    //             const url = window.prompt('url') || '';

    //             const pullResponderTrigger =
    //                 await registerNewPullResponderTrigger(
    //                     decodeID(driveID),
    //                     url,
    //                     { pullInterval: 6000 },
    //                 );
    //             await addTrigger(decodeID(driveID), pullResponderTrigger);

    //             break;
    //         }
    //         case 'add-invalid-trigger': {
    //             // ONLY AVAILABLE FOR DEBUGGING
    //             const url = window.prompt('url') || '';

    //             await addTrigger(decodeID(driveID), {
    //                 id: 'some-invalid-id',
    //                 type: 'PullResponder',
    //                 data: {
    //                     interval: '3000',
    //                     listenerId: 'invalid-listener-id',
    //                     url,
    //                 },
    //             });
    //             break;
    //         }
    //     }
    // };

    const allowedDropdownMenuOptions = useMemo(
        () => ({
            [FILE]: defaultFileOptions,
            [FOLDER]: defaultFolderOptions,
            [DRIVE]: {
                [LOCAL]: getOptionsForDriveSharingType(LOCAL),
                [CLOUD]: getOptionsForDriveSharingType(CLOUD),
                [PUBLIC]: getOptionsForDriveSharingType(PUBLIC),
            },
        }),
        [],
    );

    const dragAndDropHandlers: DragAndDropHandlers = useMemo(
        () => ({
            onDropEvent,
            onDropActivate: (dropTargetItem: UiNode) =>
                setSelectedNode(dropTargetItem),
            onDragStart: () => setDisableHoverStyles(true),
            onDragEnd: () => setDisableHoverStyles(false),
        }),
        [onDropEvent, setSelectedNode],
    );

    const nodeHandlers: NodeHandlers = useMemo(
        () => ({
            onAddFolder,
            onRenameNode,
            onDuplicateNode,
            onDeleteNode,
            onDeleteDrive,
        }),
        [
            onAddFolder,
            onDeleteDrive,
            onDeleteNode,
            onDuplicateNode,
            onRenameNode,
        ],
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
            ...nodeHandlers,
            ...dragAndDropHandlers,
            ...selectedDocumentDrive,
            driveNodesBySharingType,
            allowedDropdownMenuOptions,
            disableHoverStyles,
            makeUiDriveNodes,
            onAddFolder,
            onAddAndSelectNewFolder,
            onRenameNode,
            onDuplicateNode,
            onDeleteNode,
            showAddDriveModal,
            showDriveSettingsModal,
            openSwitchboardLink,
        }),
        [
            documentDriveServer,
            uiNodesContext,
            userPermissions,
            nodeHandlers,
            dragAndDropHandlers,
            selectedDocumentDrive,
            driveNodesBySharingType,
            allowedDropdownMenuOptions,
            disableHoverStyles,
            makeUiDriveNodes,
            onAddFolder,
            onAddAndSelectNewFolder,
            onRenameNode,
            onDuplicateNode,
            onDeleteNode,
            showAddDriveModal,
            showDriveSettingsModal,
            openSwitchboardLink,
        ],
    );
}

export type UiNodes = ReturnType<typeof useUiNodes>;
