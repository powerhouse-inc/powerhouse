import { useEffect, useRef } from 'react';
import { logger } from 'src/services/logger';
import { useDocumentDriveServer } from './useDocumentDriveServer';
import { useFeatureFlag } from './useFeatureFlags';
import defaultConfig from './useFeatureFlags/default-config';

type DefaultDrive = {
    url: string;
    loaded: boolean;
};

const areLoadedDrivesUpToDate = (
    defaultDrivesConfig: DefaultDrive[],
    loadedDrives: DefaultDrive[],
) => {
    for (const defaultDrive of defaultDrivesConfig) {
        const loadedDrive = loadedDrives.find(
            loadedDrive => loadedDrive.url === defaultDrive.url,
        );

        if (!loadedDrive) {
            return false;
        }
    }

    return true;
};

export const useLoadDefaultDrives = () => {
    const loadingDrives = useRef<string[]>([]);
    const {
        addRemoteDrive,
        documentDrives,
        documentDrivesStatus,
        clearStorage,
    } = useDocumentDriveServer();
    const {
        setConfig,
        config: { defaultDrives },
    } = useFeatureFlag();

    async function resetDefaultDrive() {
        await clearStorage();
        setConfig(defaultConfig);
        location.reload();
        loadingDrives.current = [];
    }

    useEffect(() => {
        if (!defaultDrives) return;

        // reset default drives if config has been updated
        if (
            loadingDrives.current.length <= 0 &&
            defaultDrives.every(drive => drive.loaded) &&
            defaultConfig.defaultDrives &&
            defaultConfig.defaultDrives.length > 0 &&
            !areLoadedDrivesUpToDate(defaultConfig.defaultDrives, defaultDrives)
        ) {
            void resetDefaultDrive();
            return;
        }

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

                if (isDriveAlreadyAdded) {
                    setConfig(conf => ({
                        ...conf,
                        defaultDrives: [
                            ...(conf.defaultDrives || []).filter(
                                drive => drive.url !== defaultDrive.url,
                            ),
                            { ...defaultDrive, loaded: true },
                        ],
                    }));

                    return;
                }

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
                    .catch(logger.error)
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
