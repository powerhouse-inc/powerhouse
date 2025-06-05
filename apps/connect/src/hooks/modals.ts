import { useModal } from '#components';
import { useApps } from '#store';
import {
    toast,
    type AddLocalDriveInput,
    type AddRemoteDriveInput,
} from '@powerhousedao/design-system';
import {
    FOLDER,
    useDriveIdForNode,
    useNodeKind,
    useSelectParentNodeId,
    useSetSelectedNodeId,
    type SharingType,
} from '@powerhousedao/reactor-browser';
import { type DocumentModelModule } from 'document-model';
import { t } from 'i18next';
import { useCallback } from 'react';
import { useDocumentDriveServer } from './useDocumentDriveServer';

export function useShowAddDriveModal() {
    const { showModal } = useModal();
    const { addDrive, addRemoteDrive } = useDocumentDriveServer();
    const setSelectedNodeId = useSetSelectedNodeId();
    const apps = useApps();
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

                setSelectedNodeId(newDrive.id);
            } catch (e) {
                console.error(e);
            }
        },
        [addDrive, setSelectedNodeId, t],
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

                setSelectedNodeId(newDrive.id);
            } catch (e) {
                console.error(e);
            }
        },
        [addRemoteDrive, setSelectedNodeId, t],
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

export function useShowDriveSettingsModal(driveId: string | null) {
    const { showModal } = useModal();
    const {
        renameDrive,
        setDriveAvailableOffline,
        setDriveSharingType,
        deleteDrive,
    } = useDocumentDriveServer();
    const setSelectedNodeId = useSetSelectedNodeId();
    const onRenameDrive = useCallback(
        async (newName: string) => {
            if (!driveId) return;
            await renameDrive(driveId, newName);
        },
        [renameDrive],
    );

    const onChangeSharingType = useCallback(
        async (newSharingType: SharingType) => {
            if (!driveId) return;
            await setDriveSharingType(driveId, newSharingType);
        },
        [setDriveSharingType],
    );

    const onChangeAvailableOffline = useCallback(
        async (newAvailableOffline: boolean) => {
            if (!driveId) return;
            await setDriveAvailableOffline(driveId, newAvailableOffline);
        },
        [setDriveAvailableOffline],
    );
    const onDeleteDrive = useCallback(() => {
        if (!driveId) return;
        showModal('deleteDriveModal', {
            driveId,
            onDelete: async closeModal => {
                closeModal();
                await deleteDrive(driveId);

                setSelectedNodeId(null);

                toast(t('notifications.deleteDriveSuccess'), {
                    type: 'connect-deleted',
                });
            },
        });
    }, [deleteDrive, setSelectedNodeId, showModal, t]);
    const showDriveSettingsModal = useCallback(() => {
        if (!driveId) return;
        showModal('driveSettings', {
            driveId,
            onRenameDrive,
            onDeleteDrive,
            onChangeSharingType,
            onChangeAvailableOffline,
        });
    }, [
        onChangeAvailableOffline,
        onChangeSharingType,
        onDeleteDrive,
        onRenameDrive,
        showModal,
    ]);

    return showDriveSettingsModal;
}

export function useShowDeleteNodeModal(nodeId: string | null) {
    const { showModal } = useModal();
    const { deleteNode } = useDocumentDriveServer();
    const nodeKind = useNodeKind(nodeId);
    const driveId = useDriveIdForNode(nodeId);
    const selectParentNodeId = useSelectParentNodeId(nodeId);
    const showDeleteNodeModal = useCallback(
        (nodeId: string) => {
            if (!nodeId || !driveId) return;
            showModal('deleteItem', {
                nodeId,
                onDelete: async closeModal => {
                    closeModal();

                    const i18nKey =
                        nodeKind === FOLDER
                            ? 'notifications.deleteFolderSuccess'
                            : 'notifications.fileDeleteSuccess';

                    await deleteNode(driveId, nodeId);

                    selectParentNodeId();

                    toast(t(i18nKey), { type: 'connect-deleted' });
                },
            });
        },
        [deleteNode, selectParentNodeId, showModal, t],
    );

    return showDeleteNodeModal;
}

export function useShowCreateDocumentModal() {
    const { showModal } = useModal();
    const showCreateDocumentModal = useCallback(
        (documentModel: DocumentModelModule) =>
            showModal('createDocument', {
                documentModel,
            }),
        [showModal],
    );

    return showCreateDocumentModal;
}
