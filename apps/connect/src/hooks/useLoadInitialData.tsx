import {
    CONFLICT,
    ERROR,
    LOCAL,
    SUCCESS,
    toast,
    UiDriveNode,
    useUiNodesContext,
} from '@powerhousedao/design-system';
import { DocumentDriveDocument } from 'document-model-libs/document-drive';
import { useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ReloadConnectToast } from 'src/components/toast';
import { useDocumentDriveServer } from 'src/hooks/useDocumentDriveServer';
import { useDrivesContainer } from 'src/hooks/useDrivesContainer';
import { DefaultDocumentDriveServer as server } from 'src/utils/document-drive-server';
import { useClientErrorHandler } from './useClientErrorHandler';
import { useDocumentDrives } from './useDocumentDrives';
import { useLoadDefaultDrives } from './useLoadDefaultDrives';
import { isLatestVersion } from './utils';

export const useLoadInitialData = () => {
    const { t } = useTranslation();
    const { driveNodes, setDriveNodes } = useUiNodesContext();
    const { documentDrives, onSyncStatus } = useDocumentDriveServer();
    const { makeUiDriveNodes } = useDrivesContainer();
    const prevDrivesState = useRef([...driveNodes]);
    const drivesWithError = useRef<UiDriveNode[]>([]);
    const [, , serverSubscribeUpdates] = useDocumentDrives(server);
    const clientErrorHandler = useClientErrorHandler();

    useLoadDefaultDrives();

    useEffect(() => {
        const unsubscribe = serverSubscribeUpdates(clientErrorHandler);
        return unsubscribe;
    }, [serverSubscribeUpdates, documentDrives.length, clientErrorHandler]);

    useEffect(() => {
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
                (drive.syncStatus === CONFLICT || drive.syncStatus === ERROR) &&
                drive.syncStatus !== prevDrive.syncStatus
            ) {
                // add the drive to the error list
                drivesWithError.current.push(drive);

                isLatestVersion().then(result => {
                    if (!result) {
                        return toast(<ReloadConnectToast />, {
                            type: 'connect-warning',
                        });
                    }
                });

                return toast(
                    t(
                        `notifications.${drive.syncStatus === CONFLICT ? 'driveSyncConflict' : 'driveSyncError'}`,
                        { drive: drive.name },
                    ),
                    {
                        type: 'connect-warning',
                    },
                );
            }
        });

        prevDrivesState.current = [...driveNodes];
    }, [driveNodes, t]);

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
