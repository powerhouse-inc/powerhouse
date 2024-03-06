import {
    BaseTreeItem,
    encodeID,
    useItemActions,
    useItemsContext,
} from '@powerhousedao/design-system';
import { useEffect } from 'react';
import { useDocumentDriveServer } from 'src/hooks/useDocumentDriveServer';
import { useDrivesContainer } from 'src/hooks/useDrivesContainer';
import { useSelectedPath } from 'src/store';

export const useLoadInitialData = () => {
    const { setBaseItems, items } = useItemsContext();
    const { documentDrives } = useDocumentDriveServer();
    const [selectedPath, setSelectedPath] = useSelectedPath();
    const actions = useItemActions();
    const { driveToBaseItems } = useDrivesContainer();

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
