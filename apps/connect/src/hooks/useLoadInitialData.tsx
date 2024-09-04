import {
    CONFLICT,
    ERROR,
    LOCAL,
    SUCCESS,
    toast,
    UiDriveNode,
} from '@powerhousedao/design-system';
import { DocumentDriveDocument } from 'document-model-libs/document-drive';
import { TFunction } from 'i18next';
import { useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ReloadConnectToast } from 'src/components/toast/reload-connect-toast';
import { useUiNodes } from 'src/hooks/useUiNodes';
import { DefaultDocumentDriveServer as server } from 'src/utils/document-drive-server';
import { useClientErrorHandler } from './useClientErrorHandler';
import { useDocumentDrives } from './useDocumentDrives';
import { isLatestVersion } from './utils';

export const useLoadInitialData = () => {
    const { t } = useTranslation();
    const {
        documentDrives,
        driveNodes,
        setDriveNodes,
        makeUiDriveNodes,
        onSyncStatus,
    } = useUiNodes();
    const prevDrivesState = useRef([...driveNodes]);
    const drivesWithError = useRef<UiDriveNode[]>([]);
    const [, , serverSubscribeUpdates] = useDocumentDrives(server);
    const clientErrorHandler = useClientErrorHandler();

    async function checkLatestVersion() {
        const result = await isLatestVersion();
        if (result === null) return;
        if (!result) {
            toast(<ReloadConnectToast />, {
                type: 'connect-warning',
                toastId: 'outdated-app',
                autoClose: false,
            });
        }
        return result;
    }

    useEffect(() => {
        checkLatestVersion().catch(console.error);
    }, []);

    useEffect(() => {
        const unsubscribe = serverSubscribeUpdates(clientErrorHandler);
        return unsubscribe;
    }, [serverSubscribeUpdates, documentDrives, clientErrorHandler]);

    const checkDrivesErrors = useCallback(
        async (driveNodes: UiDriveNode[], t: TFunction) => {
            driveNodes.forEach(drive => {
                const prevDrive = prevDrivesState.current.find(
                    prevDrive => prevDrive.id === drive.id,
                );

                if (!prevDrive) return;

                if (
                    drive.sharingType !== LOCAL &&
                    drive.syncStatus === SUCCESS &&
                    drivesWithError.current.includes(drive)
                ) {
                    // remove the drive from the error list
                    drivesWithError.current = drivesWithError.current.filter(
                        d => d.id !== drive.id,
                    );

                    return toast(t('notifications.driveSyncSuccess'), {
                        type: 'connect-success',
                    });
                }

                if (
                    (drive.syncStatus === CONFLICT ||
                        drive.syncStatus === ERROR) &&
                    drive.syncStatus !== prevDrive.syncStatus
                ) {
                    // add the drive to the error list
                    drivesWithError.current.push(drive);
                }
            });

            prevDrivesState.current = [...driveNodes];

            if (drivesWithError.current.length > 0) {
                const isCurrent = await checkLatestVersion();
                if (isCurrent) {
                    drivesWithError.current.forEach(drive => {
                        toast(
                            t(
                                `notifications.${drive.syncStatus === CONFLICT ? 'driveSyncConflict' : 'driveSyncError'}`,
                                { drive: drive.name },
                            ),
                            {
                                type: 'connect-warning',
                                toastId: `${drive.syncStatus === CONFLICT ? 'driveSyncConflict' : 'driveSyncError'}-${drive.id}`,
                            },
                        );
                    });
                }
            }
        },
        [],
    );

    useEffect(() => {
        checkDrivesErrors(driveNodes, t).catch(console.error);
    }, [driveNodes, t, checkDrivesErrors]);

    const updateUiDriveNodes = useCallback(
        async (documentDrives: DocumentDriveDocument[]) => {
            const uiDriveNodes = await makeUiDriveNodes(documentDrives);
            setDriveNodes(uiDriveNodes);
        },
        [makeUiDriveNodes, setDriveNodes],
    );

    useEffect(() => {
        updateUiDriveNodes(documentDrives).catch(console.error);
    }, [documentDrives, updateUiDriveNodes]);

    useEffect(() => {
        const unsub = onSyncStatus(() => updateUiDriveNodes(documentDrives));
        return unsub;
    }, [documentDrives, onSyncStatus, updateUiDriveNodes]);
};
