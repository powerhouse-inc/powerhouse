import { ReloadConnectToast } from '#components';
import { useDocumentDriveServer } from '#hooks';
import { CONFLICT, ERROR, LOCAL, SUCCESS } from '@powerhousedao/design-system';
import { getDriveSharingType, useUnwrappedDrives } from '@powerhousedao/state';
import { logger, type DocumentDriveDocument } from 'document-drive';
import { type TFunction } from 'i18next';
import { useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from '../services/toast.js';
import { useClientErrorHandler } from './useClientErrorHandler.js';
import { useConnectConfig } from './useConnectConfig.js';
import { isLatestVersion } from './utils.js';

export const useLoadInitialData = () => {
    const { t } = useTranslation();
    const { getSyncStatusSync } = useDocumentDriveServer();
    const drivesWithError = useRef<DocumentDriveDocument[]>([]);
    const drives = useUnwrappedDrives();
    const clientErrorHandler = useClientErrorHandler();
    const [connectConfig] = useConnectConfig();

    async function checkLatestVersion() {
        const result = await isLatestVersion();
        if (result === null) return;
        // ignore dev/staging versions
        if (result.isLatest || result.currentVersion.includes('-')) {
            return true;
        }

        if (
            import.meta.env.MODE === 'development' ||
            connectConfig.studioMode ||
            !connectConfig.warnOutdatedApp
        ) {
            logger.warn(
                `Connect is outdated: \nCurrent: ${result.currentVersion}\nLatest: ${result.latestVersion}`,
            );
        } else {
            toast(<ReloadConnectToast />, {
                type: 'connect-warning',
                toastId: 'outdated-app',
                autoClose: false,
            });
        }
    }

    useEffect(() => {
        checkLatestVersion().catch(console.error);
    }, []);

    const checkDrivesErrors = useCallback(
        async (drives: DocumentDriveDocument[], t: TFunction) => {
            drives.forEach(drive => {
                const prevDrive = drivesWithError.current.find(
                    prevDrive => prevDrive.header.id === drive.header.id,
                );

                if (!prevDrive) return;

                const sharingType = getDriveSharingType(drive);
                const prevSyncStatus = getSyncStatusSync(
                    prevDrive.header.id,
                    sharingType,
                );
                const syncStatus = getSyncStatusSync(
                    drive.header.id,
                    sharingType,
                );

                if (
                    sharingType !== LOCAL &&
                    syncStatus === SUCCESS &&
                    drivesWithError.current.includes(drive)
                ) {
                    // remove the drive from the error list
                    drivesWithError.current = drivesWithError.current.filter(
                        d => d.header.id !== drive.header.id,
                    );

                    return toast(t('notifications.driveSyncSuccess'), {
                        type: 'connect-success',
                    });
                }

                if (
                    (syncStatus === CONFLICT || syncStatus === ERROR) &&
                    syncStatus !== prevSyncStatus
                ) {
                    // add the drive to the error list
                    drivesWithError.current.push(drive);
                }
            });

            if (drivesWithError.current.length > 0) {
                const isCurrent = await checkLatestVersion();
                if (isCurrent) {
                    drivesWithError.current.forEach(drive => {
                        const sharingType = getDriveSharingType(drive);
                        const syncStatus = getSyncStatusSync(
                            drive.header.id,
                            sharingType,
                        );
                        toast(
                            t(
                                `notifications.${syncStatus === CONFLICT ? 'driveSyncConflict' : 'driveSyncError'}`,
                                { drive: drive.header.name },
                            ),
                            {
                                type: 'connect-warning',
                                toastId: `${syncStatus === CONFLICT ? 'driveSyncConflict' : 'driveSyncError'}-${drive.header.id}`,
                            },
                        );
                    });
                }
            }
        },
        [],
    );

    useEffect(() => {
        checkDrivesErrors(drives ?? [], t).catch(console.error);
    }, [drives, t, checkDrivesErrors]);
};
