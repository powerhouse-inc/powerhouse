import { useModal } from '#components';
import { useApps } from '#store';
import {
    toast,
    type AddLocalDriveInput,
    type AddRemoteDriveInput,
} from '@powerhousedao/design-system';
import {
    FOLDER,
    useUiNodesContext,
    type SharingType,
    type UiDriveNode,
    type UiFileNode,
    type UiFolderNode,
} from '@powerhousedao/reactor-browser';
import { t } from 'i18next';
import { useCallback } from 'react';
import { useDocumentDriveServer } from './useDocumentDriveServer';
import { useMakeUiDriveNode } from './useUiNodes';

export function useShowAddDriveModal() {
    const { showModal } = useModal();
    const { addDrive, addRemoteDrive } = useDocumentDriveServer();
    const { setSelectedNode } = useUiNodesContext();
    const apps = useApps();
    const makeUiDriveNode = useMakeUiDriveNode();
    const onAddLocalDrive = useCallback(
        async (data: AddLocalDriveInput) => {
            try {
                const app = apps.find(a => a.id === data.appId);
                const newDrive = await addDrive(
                    {
                        id: '',
                        slug: '',
                        global: {
                            name: data.name,
                            icon: null,
                        },
                        local: {
                            availableOffline: data.availableOffline,
                            sharingType: data.sharingType.toLowerCase(),
                            listeners: [],
                            triggers: [],
                        },
                    },
                    app?.driveEditor,
                );

                toast(t('notifications.addDriveSuccess'), {
                    type: 'connect-success',
                });

                if (newDrive) {
                    const newDriveNode = await makeUiDriveNode(newDrive);
                    setSelectedNode(newDriveNode);
                }
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
                });

                toast(t('notifications.addDriveSuccess'), {
                    type: 'connect-success',
                });

                if (newDrive) {
                    const newDriveNode = await makeUiDriveNode(newDrive);
                    setSelectedNode(newDriveNode);
                }
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

    return showAddDriveModal;
}

export function useShowDriveSettingsModal() {
    const { showModal } = useModal();
    const {
        renameDrive,
        setDriveAvailableOffline,
        setDriveSharingType,
        deleteDrive,
    } = useDocumentDriveServer();
    const { driveNodes, setSelectedNode } = useUiNodesContext();
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

    return showDriveSettingsModal;
}

export function useShowDeleteNodeModal() {
    const { showModal } = useModal();
    const { setSelectedNode, getParentNode } = useUiNodesContext();
    const { deleteNode } = useDocumentDriveServer();
    const showDeleteNodeModal = useCallback(
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

    return showDeleteNodeModal;
}
