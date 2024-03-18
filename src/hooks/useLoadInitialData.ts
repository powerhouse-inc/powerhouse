import {
    BaseTreeItem,
    encodeID,
    toast,
    useItemActions,
    useItemsContext,
    usePathContent,
} from '@powerhousedao/design-system';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useDocumentDriveServer } from 'src/hooks/useDocumentDriveServer';
import { useDrivesContainer } from 'src/hooks/useDrivesContainer';
import { useSelectedPath } from 'src/store/document-drive';

export const useLoadInitialData = () => {
    const { t } = useTranslation();
    const { setBaseItems, items } = useItemsContext();
    const { documentDrives } = useDocumentDriveServer();
    const [selectedPath, setSelectedPath] = useSelectedPath();
    const actions = useItemActions();
    const { driveToBaseItems } = useDrivesContainer();
    const drives = usePathContent();
    const prevDrivesState = useRef([...drives]);

    useEffect(() => {
        drives.forEach(drive => {
            const prevDrive = prevDrivesState.current.find(
                prevDrive => prevDrive.id === drive.id,
            );

            if (!prevDrive) return;

            if (
                drive.type !== 'LOCAL_DRIVE' &&
                drive.syncStatus === 'SUCCESS' &&
                drive.syncStatus !== prevDrive.syncStatus
            ) {
                return toast(t('notifications.driveSyncSuccess'), {
                    type: 'connect-success',
                });
            }

            if (
                (drive.syncStatus === 'CONFLICT' ||
                    drive.syncStatus === 'ERROR') &&
                drive.syncStatus !== prevDrive.syncStatus
            ) {
                return toast(
                    t('notifications.driveSyncError', { drive: drive.label }),
                    {
                        type: 'connect-warning',
                    },
                );
            }
        });

        prevDrivesState.current = [...drives];
    }, [drives]);

    useEffect(() => {
        updateBaseItems().catch(console.error);

        async function updateBaseItems() {
            const baseItems: Array<BaseTreeItem> =
                documentDrives.length > 0
                    ? (
                          await Promise.all(
                              documentDrives.map(driveToBaseItems),
                          )
                      ).flat()
                    : [];

            setBaseItems(baseItems);
        }
    }, [documentDrives]);

    // Auto select first drive if there is no selected path
    useEffect(() => {
        if (!selectedPath && items.length > 0) {
            const driveID = documentDrives[0].state.global.id;

            setSelectedPath(encodeID(driveID));
            actions.setSelectedItem(driveID);
            actions.setExpandedItem(driveID, true);
        }
    }, [items, selectedPath]);
};
