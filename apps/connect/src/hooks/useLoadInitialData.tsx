import { ReloadConnectToast } from '#components';
import { useReadModeContext } from '#context';
import { useDocumentDriveServer, useMakeUiDriveNode } from '#hooks';
import { useAsyncReactor } from '#store';
import {
    CONFLICT,
    ERROR,
    LOCAL,
    SUCCESS,
    type UiDriveNode,
} from '@powerhousedao/design-system';
import {
    useUiNodesContext,
    useUpdateNodeMap,
} from '@powerhousedao/reactor-browser';
import { logger, type DocumentDriveDocument } from 'document-drive';
import { type TFunction } from 'i18next';
import { useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from '../services/toast.js';
import { useClientErrorHandler } from './useClientErrorHandler.js';
import { useConnectConfig } from './useConnectConfig.js';
import { useDocumentDrives } from './useDocumentDrives.js';
import { isLatestVersion } from './utils.js';

export const useLoadInitialData = () => {
    const { t } = useTranslation();
    const { documentDrives, onSyncStatus } = useDocumentDriveServer();
    const { driveNodes, setDriveNodes } = useUiNodesContext();
    const updateNodeMap = useUpdateNodeMap();
    const prevDrivesState = useRef([...driveNodes]);
    const drivesWithError = useRef<UiDriveNode[]>([]);
    const [, , serverSubscribeUpdates] = useDocumentDrives();
    const { readDrives } = useReadModeContext();
    const clientErrorHandler = useClientErrorHandler();
    const reactor = useAsyncReactor();
    const [connectConfig] = useConnectConfig();

    async function checkLatestVersion() {
        const result = await isLatestVersion();
        if (result === null) return;
        if (result.isLatest) {
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

    const makeUiDriveNode = useMakeUiDriveNode();

    const makeUiDriveNodes = useCallback(
        async (documentDrives: DocumentDriveDocument[]) => {
            return Promise.all(documentDrives.map(makeUiDriveNode));
        },
        [makeUiDriveNode],
    );

    const updateUiDriveNodes = useCallback(
        async (documentDrives: DocumentDriveDocument[]) => {
            const uiDriveNodes = await makeUiDriveNodes(documentDrives);
            setDriveNodes(uiDriveNodes);
            updateNodeMap(documentDrives);
        },
        [makeUiDriveNodes, setDriveNodes, updateNodeMap],
    );
    useEffect(() => {
        const drives: DocumentDriveDocument[] = [
            ...readDrives,
            ...documentDrives,
        ];
        updateUiDriveNodes(drives).catch(console.error);
    }, [documentDrives, readDrives, updateUiDriveNodes]);

    useEffect(() => {
        if (!reactor) {
            return;
        }

        const unsub = onSyncStatus(() => updateUiDriveNodes(documentDrives));
        return unsub;
    }, [reactor, documentDrives, onSyncStatus, updateUiDriveNodes]);
};
