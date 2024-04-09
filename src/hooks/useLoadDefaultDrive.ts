import { useEffect, useRef } from 'react';
import { useDocumentDriveServer } from './useDocumentDriveServer';
import { useFeatureFlag } from './useFeatureFlags';

export const useLoadDefaultDrive = () => {
    const loading = useRef(false);
    const { addRemoteDrive, documentDrives } = useDocumentDriveServer();
    const {
        setConfig,
        config: { defaultDrive },
    } = useFeatureFlag();

    useEffect(() => {
        if (defaultDrive && !defaultDrive.loaded && !loading.current) {
            const isDriveAlreadyAdded = documentDrives.some(drive => {
                return drive.state.local.triggers.some(
                    trigger => trigger.data?.url === defaultDrive.url,
                );
            });

            if (isDriveAlreadyAdded) return;

            loading.current = true;

            addRemoteDrive(defaultDrive.url, {
                sharingType: 'PUBLIC',
                availableOffline: true,
                listeners: [
                    {
                        block: true,
                        callInfo: {
                            data: defaultDrive.url,
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
            })
                .then(() =>
                    setConfig(conf => ({
                        ...conf,
                        defaultDrive: { ...defaultDrive, loaded: true },
                    })),
                )
                .catch(console.error)
                .finally(() => (loading.current = false));
        }
    }, [documentDrives, defaultDrive]);

    return loading.current;
};
