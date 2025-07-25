import { useModal } from '#components';
import { useApps } from '#store';
import {
    toast,
    type AddLocalDriveInput,
    type AddRemoteDriveInput,
    type SharingType,
} from '@powerhousedao/design-system';
import {
    useDrives,
    useSelectedDrive,
    useSelectedParentFolder,
    useSetSelectedDrive,
    useSetSelectedNode,
} from '@powerhousedao/state';
import { type DocumentDriveDocument, type Node } from 'document-drive';
import { t } from 'i18next';
import { useCallback } from 'react';
import { useDocumentDriveServer } from './useDocumentDriveServer';

export function useShowAddDriveModal() {
    const { showModal } = useModal();
    const { addDrive, addRemoteDrive } = useDocumentDriveServer();
    const setSelectedDrive = useSetSelectedDrive();
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

                if (!newDrive) {
                    return;
                }

                setSelectedDrive(newDrive.header.id);
            } catch (e) {
                console.error(e);
            }
        },
        [addDrive, setSelectedDrive, t],
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

                if (!newDrive) {
                    return;
                }

                setSelectedDrive(newDrive.header.id);
            } catch (e) {
                console.error(e);
            }
        },
        [addRemoteDrive, setSelectedDrive, t],
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
    const drives = useDrives();
    const setSelectedDrive = useSetSelectedDrive();
    const onRenameDrive = useCallback(
        async (drive: DocumentDriveDocument, newName: string) => {
            await renameDrive(drive.header.id, newName);
        },
        [renameDrive],
    );

    const onChangeSharingType = useCallback(
        async (drive: DocumentDriveDocument, newSharingType: SharingType) => {
            await setDriveSharingType(drive.header.id, newSharingType);
        },
        [setDriveSharingType],
    );

    const onChangeAvailableOffline = useCallback(
        async (drive: DocumentDriveDocument, newAvailableOffline: boolean) => {
            await setDriveAvailableOffline(
                drive.header.id,
                newAvailableOffline,
            );
        },
        [setDriveAvailableOffline],
    );
    const onDeleteDrive = useCallback(
        (drive: DocumentDriveDocument) => {
            showModal('deleteDriveModal', {
                drive,
                onDelete: async closeModal => {
                    closeModal();
                    await deleteDrive(drive.header.id);

                    setSelectedDrive(drives?.[0]?.header.id);

                    toast(t('notifications.deleteDriveSuccess'), {
                        type: 'connect-deleted',
                    });
                },
            });
        },
        [deleteDrive, drives, setSelectedDrive, showModal, t],
    );
    const showDriveSettingsModal = useCallback(
        (drive: DocumentDriveDocument) => {
            showModal('driveSettings', {
                drive,
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
    const { deleteNode } = useDocumentDriveServer();
    const selectedDrive = useSelectedDrive();
    const selectedParentFolder = useSelectedParentFolder();
    const setSelectedNode = useSetSelectedNode();
    const showDeleteNodeModal = useCallback(
        (node: Node) => {
            showModal('deleteItem', {
                id: node.id,
                onDelete: async closeModal => {
                    if (!selectedDrive?.header.id) {
                        return;
                    }
                    closeModal();

                    const i18nKey =
                        node.kind === 'folder'
                            ? 'notifications.deleteFolderSuccess'
                            : 'notifications.fileDeleteSuccess';

                    await deleteNode(selectedDrive.header.id, node.id);

                    setSelectedNode(selectedParentFolder?.id);

                    toast(t(i18nKey), { type: 'connect-deleted' });
                },
            });
        },
        [
            deleteNode,
            selectedDrive?.header.id,
            selectedParentFolder?.id,
            setSelectedNode,
            showModal,
            t,
        ],
    );

    return showDeleteNodeModal;
}
