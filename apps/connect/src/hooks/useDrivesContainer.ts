import {
    ActionType,
    DriveTreeItem,
    DriveViewProps,
    ItemType,
    TreeItem,
    traverseTree,
} from '@powerhousedao/design-system';
import path from 'path';
import { useDrives, useSelectFolder } from 'src/store';
import { getLastIndexFromPath, sanitizePath } from 'src/utils';
import { useDocumentDrive } from './useDocumentDrive';

export function useDrivesContainer() {
    const [, setDrives] = useDrives();
    const { documentDrive, openFile, addFolder, deleteNode, renameNode } =
        useDocumentDrive();
    const selectFolder = useSelectFolder();

    function addVirtualNewFolder(item: TreeItem, drive: DriveTreeItem) {
        const driveNodes = documentDrive?.state.drives.find(
            driveItem => driveItem.id === drive.id
        )?.nodes;

        const findPath = `${item.id}/new-folder`;
        const lastIndex = getLastIndexFromPath(
            [...(driveNodes || [])],
            findPath
        );

        const virtualPathName =
            'new-folder' + (lastIndex === null ? '' : `-${lastIndex + 1}`);
        const virtualFolderName =
            'New Folder' + (lastIndex === null ? '' : ` ${lastIndex + 1}`);

        setDrives(drives => {
            const newDrives = drives.map(driveItem => {
                if (driveItem.id === drive.id) {
                    return traverseTree(driveItem, treeItem => {
                        if (treeItem.id === item.id) {
                            treeItem.expanded = true;
                            treeItem.isSelected = false;
                            treeItem.children = treeItem.children || [];
                            treeItem.children.push({
                                id: `${treeItem.id}/${virtualPathName}`,
                                label: virtualFolderName,
                                type: ItemType.Folder,
                                action: ActionType.New,
                            });
                        }

                        return { ...treeItem };
                    }) as DriveTreeItem<
                        'duplicate' | 'new-folder' | 'rename' | 'delete'
                    >;
                }

                return { ...driveItem };
            });

            return newDrives;
        });
    }

    function addNewFolder(
        item: TreeItem,
        drive: DriveTreeItem,
        onCancel?: () => void
    ) {
        const normalizedPath = item.id.replace(drive.id, '');
        const basePath = normalizedPath.split('/').slice(0, -1).join('/');

        const newPath = path.join(basePath, sanitizePath(item.label));
        if (newPath === '.') return onCancel?.();

        addFolder(drive.id, newPath, item.label);
    }

    function updateItem(item: TreeItem, drive: DriveTreeItem) {
        setDrives(drives =>
            drives.map(_drive => {
                if (_drive.id !== drive.id) {
                    return _drive;
                }
                return traverseTree(drive, _item =>
                    _item.id !== item.id ? _item : item
                ) as DriveTreeItem<
                    'duplicate' | 'new-folder' | 'rename' | 'delete'
                >;
            })
        );
    }

    function setItemUpdate(item: TreeItem, drive: DriveTreeItem) {
        updateItem(
            {
                ...item,
                action: ActionType.Update,
            },
            drive
        );
    }

    const onItemClick: DriveViewProps['onItemClick'] = (
        _event,
        item,
        drive
    ) => {
        if (item.type === ItemType.File) {
            openFile(drive.id, item.id);
        } else {
            selectFolder(drive.id, item.id);
        }
    };

    const onItemOptionsClick: DriveViewProps['onItemOptionsClick'] = (
        item,
        option,
        drive
    ) => {
        switch (option) {
            case 'new-folder':
                addVirtualNewFolder(item, drive);
                break;
            case 'rename':
                setItemUpdate(item, drive);
                break;
            case 'delete':
                deleteNode(drive.id, item.id);
                break;
        }
    };

    async function updateNodeName(item: TreeItem, drive: DriveTreeItem) {
        renameNode(drive.id, item.id, item.label);
    }

    const onSubmitInput = (
        item: TreeItem,
        drive: DriveTreeItem,
        onCancel?: () => void
    ) => {
        if (item.action === ActionType.New) {
            addNewFolder(item, drive, onCancel);
            return;
        }

        updateNodeName(item, drive);
    };

    return { onItemClick, onItemOptionsClick, onSubmitInput };
}
