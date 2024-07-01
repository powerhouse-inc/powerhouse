import {
    BaseTreeItem,
    decodeID,
    toast,
    useGetItemById,
    useItemActions,
    useItemsContext,
    usePathContent,
} from '@powerhousedao/design-system';
import { DocumentDriveDocument } from 'document-model-libs/document-drive';
import { useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ReloadConnectToast } from 'src/components/toast';
import { useDocumentDriveServer } from 'src/hooks/useDocumentDriveServer';
import { useDrivesContainer } from 'src/hooks/useDrivesContainer';
import { useSelectedPath } from 'src/store/document-drive';
import { DefaultDocumentDriveServer as server } from 'src/utils/document-drive-server';
import { useDocumentDrives } from './useDocumentDrives';
import { useLoadDefaultDrive } from './useLoadDefaultDrive';
import { useNavigateToItemId } from './useNavigateToItemId';
import { isLatestVersion } from './utils';

export const useLoadInitialData = () => {
    const { t } = useTranslation();
    const { setBaseItems, items } = useItemsContext();
    const { documentDrives, onSyncStatus } = useDocumentDriveServer();
    const [selectedPath] = useSelectedPath();
    const actions = useItemActions();
    const { driveToBaseItems } = useDrivesContainer();
    const drives = usePathContent();
    const prevDrivesState = useRef([...drives]);
    const drivesWithError = useRef<string[]>([]);
    const isFirstLoad = useRef(true);
    const navigateToItemId = useNavigateToItemId();
    const getItemById = useGetItemById();
    const [, , serverSubscribeUpdates] = useDocumentDrives(server);

    useLoadDefaultDrive();

    useEffect(() => {
        const unsubscribe = serverSubscribeUpdates();
        return unsubscribe;
    }, [serverSubscribeUpdates]);

    useEffect(() => {
        drives.forEach(drive => {
            const prevDrive = prevDrivesState.current.find(
                prevDrive => prevDrive.id === drive.id,
            );

            if (!prevDrive) return;

            if (
                drive.type !== 'LOCAL_DRIVE' &&
                drive.syncStatus === 'SUCCESS' &&
                drivesWithError.current.includes(drive.id)
            ) {
                // remove the drive from the error list
                drivesWithError.current = drivesWithError.current.filter(
                    id => id !== drive.id,
                );

                return toast(t('notifications.driveSyncSuccess'), {
                    type: 'connect-success',
                });
            }

            if (
                (drive.syncStatus === 'CONFLICT' ||
                    drive.syncStatus === 'ERROR') &&
                drive.syncStatus !== prevDrive.syncStatus
            ) {
                // add the drive to the error list
                drivesWithError.current.push(drive.id);

                isLatestVersion().then(result => {
                    if (!result) {
                        return toast(<ReloadConnectToast />, {
                            type: 'connect-warning',
                        });
                    }
                });

                return toast(
                    t(
                        `notifications.${drive.syncStatus === 'CONFLICT' ? 'driveSyncConflict' : 'driveSyncError'}`,
                        { drive: drive.label },
                    ),
                    {
                        type: 'connect-warning',
                    },
                );
            }
        });

        prevDrivesState.current = [...drives];
    }, [drives]);

    const updateBaseItems = useCallback(
        async (documentDrives: DocumentDriveDocument[]) => {
            const baseItems: Array<BaseTreeItem> =
                documentDrives.length > 0
                    ? (
                          await Promise.all(
                              documentDrives.map(driveToBaseItems),
                          )
                      ).flat()
                    : [];

            setBaseItems(baseItems);
        },
        [documentDrives],
    );

    useEffect(() => {
        updateBaseItems(documentDrives).catch(console.error);
    }, [documentDrives, updateBaseItems]);

    useEffect(() => {
        const unsub = onSyncStatus(() => updateBaseItems(documentDrives));
        return unsub;
    }, [documentDrives, onSyncStatus, updateBaseItems]);

    // Auto select first drive if there is no selected path
    useEffect(() => {
        if (!selectedPath && items.length > 0) {
            const driveID = documentDrives[0].state.global.id;

            actions.setSelectedItem(driveID);
            actions.setExpandedItem(driveID, true);

            navigateToItemId(driveID);
        }
    }, [items, selectedPath]);

    // expand the selected path in the Sidebar on first load
    useEffect(() => {
        if (selectedPath && isFirstLoad.current) {
            isFirstLoad.current = false;
            const pathItemsIds = selectedPath.split('/');

            for (const id of pathItemsIds) {
                const item = getItemById(decodeID(id));
                if (item?.type === 'FILE') return;

                actions.setExpandedItem(decodeID(id), true);
            }

            // get the last item in the path and select it
            const lastItemId = pathItemsIds[pathItemsIds.length - 1];
            if (lastItemId) {
                const item = getItemById(decodeID(lastItemId));
                if (item?.type === 'FILE') return;

                actions.setSelectedItem(decodeID(lastItemId));
            }
        }
    }, [selectedPath]);
};
