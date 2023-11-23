import {
    ActionType,
    DriveViewProps,
    ItemType,
    TreeItem,
    decodeID,
    getRootPath,
    useItemActions,
} from '@powerhousedao/design-system';
import path from 'path';
import { useSelectedPath } from 'src/store';
import { getLastIndexFromPath, sanitizePath } from 'src/utils';
import { v4 as uuid } from 'uuid';
import { useDocumentDrive } from './useDocumentDrive';

export function useDrivesContainer() {
    const actions = useItemActions();
    const [, setSelectedPath] = useSelectedPath();

    const { openFile, addFolder, deleteNode, renameNode, documentDrive } =
        useDocumentDrive();

    function addVirtualNewFolder(item: TreeItem, driveID: string) {
        const driveNodes = documentDrive?.state.drives.find(
            driveItem => driveItem.id === decodeID(driveID)
        )?.nodes;

        const baseItemPath = item.path.split('/').slice(1).join('/');
        const findPath = path.join(baseItemPath, 'new-folder');

        const lastIndex = getLastIndexFromPath(
            [...(driveNodes || [])],
            findPath
        );

        const virtualPathName =
            'new-folder' + (lastIndex === null ? '' : `-${lastIndex + 1}`);
        const virtualFolderName =
            'New Folder' + (lastIndex === null ? '' : ` ${lastIndex + 1}`);

        actions.newVirtualItem({
            id: uuid(),
            label: virtualFolderName,
            path: path.join(item.path, virtualPathName),
            type: ItemType.Folder,
            action: ActionType.New,
        });
    }

    function addNewFolder(
        item: TreeItem,
        driveID: string,
        onCancel?: () => void
    ) {
        const basePath = item.path.split('/').slice(1, -1).join('/');
        const newPath = path.join(basePath, sanitizePath(item.label));

        if (newPath === '.') return onCancel?.();

        const decodedDriveID = decodeID(driveID);
        addFolder(decodedDriveID, newPath, item.label);
    }

    const onItemClick: DriveViewProps['onItemClick'] = (_event, item) => {
        if (item.type === ItemType.File) {
            const decodedDriveID = decodeID(getRootPath(item.path));
            openFile(decodedDriveID, item.id);
        } else {
            setSelectedPath(item.path);
            actions.toggleExpandedAndSelect(item.id);
        }
    };

    const onItemOptionsClick: DriveViewProps['onItemOptionsClick'] = (
        item,
        option
    ) => {
        const driveID = item.path.split('/')[0];

        switch (option) {
            case 'new-folder':
                actions.setExpandedItem(item.id, true);
                addVirtualNewFolder(item, driveID);
                break;
            case 'rename':
                actions.setItemAction(item.id, ActionType.Update);
                break;
            case 'delete':
                deleteNode(decodeID(driveID), item.id);
                break;
        }
    };

    async function updateNodeName(item: TreeItem, driveID: string) {
        const baseItemPath = item.path.split('/').slice(1).join('/');
        const decodedDriveID = decodeID(driveID);

        renameNode(decodedDriveID, baseItemPath, item.label);
    }

    const onSubmitInput = (item: TreeItem, onCancel?: () => void) => {
        const driveID = item.path.split('/')[0];

        if (item.action === ActionType.New) {
            actions.deleteVirtualItem(item.id);
            addNewFolder(item, driveID, onCancel);
            return;
        }

        actions.setItemAction(item.id, null);
        updateNodeName(item, driveID);
    };

    return {
        onItemClick,
        onItemOptionsClick,
        onSubmitInput,
    };
}
