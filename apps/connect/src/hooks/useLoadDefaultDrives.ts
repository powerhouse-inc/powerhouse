import { useEffect, useRef } from 'react';
import { useDocumentDriveServer } from './useDocumentDriveServer';
import { useFeatureFlag } from './useFeatureFlags';

export const useLoadDefaultDrives = () => {
    const loadingDrives = useRef<string[]>([]);
    const { addRemoteDrive, documentDrives, documentDrivesStatus } =
        useDocumentDriveServer();
    const {
        setConfig,
        config: { defaultDrives },
    } = useFeatureFlag();

    useEffect(() => {
        if (!defaultDrives) return;

        for (const defaultDrive of defaultDrives) {
            if (
                documentDrivesStatus === 'LOADED' &&
                !defaultDrive.loaded &&
                !loadingDrives.current.includes(defaultDrive.url)
            ) {
                const isDriveAlreadyAdded = documentDrives.some(drive => {
                    return drive.state.local.triggers.some(
                        trigger => trigger.data?.url === defaultDrive.url,
                    );
                });

                if (isDriveAlreadyAdded) return;

                loadingDrives.current.push(defaultDrive.url);

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
                            defaultDrives: [
                                ...(conf.defaultDrives || []).filter(
                                    drive => drive.url !== defaultDrive.url,
                                ),
                                { ...defaultDrive, loaded: true },
                            ],
                        })),
                    )
                    .catch(console.error)
                    .finally(() => {
                        loadingDrives.current = loadingDrives.current.filter(
                            url => url !== defaultDrive.url,
                        );
                    });
            }
        }
    }, [documentDrives, defaultDrives, documentDrivesStatus]);

    return loadingDrives.current.length > 0;
};
