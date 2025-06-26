import { useConnectCrypto, useDocumentDriveServer } from '#hooks';
import { useUser } from '#store';
import { useApps, useModal, useSetSelectedDrive } from '@powerhousedao/common';
import {
    type AddLocalDriveInput,
    type AddRemoteDriveInput,
    AddDriveModal as ConnectAddLocalDriveModal,
    toast,
} from '@powerhousedao/design-system';
import { requestPublicDrive } from 'document-drive';
import { t } from 'i18next';
import { useCallback } from 'react';

export function AddDriveModal() {
    const { isOpen, hide } = useModal('addDrive');
    const user = useUser();
    const apps = useApps();
    const { getBearerToken } = useConnectCrypto();
    const { addDrive, addRemoteDrive } = useDocumentDriveServer();
    const setSelectedDrive = useSetSelectedDrive();
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

                setSelectedDrive(newDrive.id);
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

                setSelectedDrive(newDrive.id);
            } catch (e) {
                console.error(e);
            }
        },
        [addRemoteDrive, setSelectedDrive, t],
    );
    const onAddLocalDriveSubmit = useCallback(
        async (data: AddLocalDriveInput) => {
            await onAddLocalDrive(data);
            hide();
        },
        [addDrive, hide],
    );

    const onAddRemoteDriveSubmit = useCallback(
        async (data: AddRemoteDriveInput) => {
            await onAddRemoteDrive(data);
            hide();
        },
        [addRemoteDrive, hide],
    );

    if (!isOpen) return null;

    return (
        <ConnectAddLocalDriveModal
            open={isOpen}
            onAddLocalDrive={onAddLocalDriveSubmit}
            onAddRemoteDrive={onAddRemoteDriveSubmit}
            requestPublicDrive={async (url: string) => {
                try {
                    const authToken = await getBearerToken(url, user?.address);
                    return requestPublicDrive(url, {
                        Authorization: `Bearer ${authToken}`,
                    });
                } catch (error) {
                    console.error(error);
                    const authToken = await getBearerToken(
                        url,
                        user?.address,
                        true,
                    );
                    return requestPublicDrive(url, {
                        Authorization: `Bearer ${authToken}`,
                    });
                }
            }}
            onOpenChange={status => {
                if (!status) return hide();
            }}
            appOptions={apps}
        />
    );
}
