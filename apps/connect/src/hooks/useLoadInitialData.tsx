import { useUiNodesContext } from '@powerhousedao/design-system';
import { DocumentDriveDocument } from 'document-model-libs/document-drive';
import { useCallback, useEffect } from 'react';
import { useDocumentDriveServer } from 'src/hooks/useDocumentDriveServer';
import { useDrivesContainer } from 'src/hooks/useDrivesContainer';
import { DefaultDocumentDriveServer as server } from 'src/utils/document-drive-server';
import { useClientErrorHandler } from './useClientErrorHandler';
import { useDocumentDrives } from './useDocumentDrives';
import { useLoadDefaultDrives } from './useLoadDefaultDrives';
// import { useNavigateToNode } from './useNavigateToItemId';
// import { isLatestVersion } from './utils';

export const useLoadInitialData = () => {
    // const { t } = useTranslation();
    const { selectedNode, driveNodes, setSelectedNode, setDriveNodes } =
        useUiNodesContext();
    const { documentDrives, onSyncStatus } = useDocumentDriveServer();
    const { makeUiDriveNodes } = useDrivesContainer();
    // const prevDrivesState = useRef([...drives]);
    // const drivesWithError = useRef<string[]>([]);
    // const isFirstLoad = useRef(true);
    const [, , serverSubscribeUpdates] = useDocumentDrives(server);
    const clientErrorHandler = useClientErrorHandler();

    useLoadDefaultDrives();

    useEffect(() => {
        const unsubscribe = serverSubscribeUpdates(clientErrorHandler);
        return unsubscribe;
    }, [serverSubscribeUpdates, documentDrives.length, clientErrorHandler]);

    // useEffect(() => {
    //     drives.forEach(drive => {
    //         const prevDrive = prevDrivesState.current.find(
    //             prevDrive => prevDrive.id === drive.id,
    //         );

    //         if (!prevDrive) return;

    //         if (
    //             drive.type !== 'LOCAL_DRIVE' &&
    //             drive.syncStatus === 'SUCCESS' &&
    //             drivesWithError.current.includes(drive.id)
    //         ) {
    //             // remove the drive from the error list
    //             drivesWithError.current = drivesWithError.current.filter(
    //                 id => id !== drive.id,
    //             );

    //             return toast(t('notifications.driveSyncSuccess'), {
    //                 type: 'connect-success',
    //             });
    //         }

    //         if (
    //             (drive.syncStatus === 'CONFLICT' ||
    //                 drive.syncStatus === 'ERROR') &&
    //             drive.syncStatus !== prevDrive.syncStatus
    //         ) {
    //             // add the drive to the error list
    //             drivesWithError.current.push(drive.id);

    //             isLatestVersion().then(result => {
    //                 if (!result) {
    //                     return toast(<ReloadConnectToast />, {
    //                         type: 'connect-warning',
    //                     });
    //                 }
    //             });

    //             return toast(
    //                 t(
    //                     `notifications.${drive.syncStatus === 'CONFLICT' ? 'driveSyncConflict' : 'driveSyncError'}`,
    //                     { drive: drive.label },
    //                 ),
    //                 {
    //                     type: 'connect-warning',
    //                 },
    //             );
    //         }
    //     });

    //     prevDrivesState.current = [...drives];
    // }, [drives]);

    const updateUiDriveNodes = useCallback(
        async (documentDrives: DocumentDriveDocument[]) => {
            const uiDriveNodes = await makeUiDriveNodes(documentDrives);
            console.log({ uiDriveNodes });
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

    // Auto select first drive if there is no selected node
    useEffect(() => {
        if (!selectedNode) {
            setSelectedNode(driveNodes[0]);
        }
    }, [driveNodes, selectedNode, setSelectedNode]);
};
