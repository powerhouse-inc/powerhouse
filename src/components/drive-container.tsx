import {
    ActionType,
    DriveTreeItem,
    DriveView,
    DriveViewProps,
    ItemType,
    OnItemOptionsClickHandler,
    TreeItem,
    traverseDriveById,
    traverseTree,
} from '@powerhousedao/design-system';
import { Drive, Node } from 'document-model-libs/document-drive';
import { Immutable } from 'document-model/document';
import path from 'path';
import { useEffect, useState } from 'react';
import { useDocumentDrive } from 'src/hooks/useDocumentDrive';
import { SortOptions } from 'src/services/document-drive';
import { getLastIndexFromPath, sanitizePath } from 'src/utils/path';

function mapDocumentDriveNodeToTreeItem(
    node: Immutable<Node>,
    allNodes: Immutable<Array<Node>>
): TreeItem {
    const isFolder = node.kind === 'folder';
    const isChildrenRootNode = (childrenPath: string) => {
        const isChildrenNode = childrenPath.startsWith(node.path);
        if (!isChildrenNode) return false;

        const parentSegments = node.path.split('/').length;
        const childrenSegments = childrenPath.split('/').length;

        const isChildrenRoot = parentSegments + 1 === childrenSegments;
        return isChildrenRoot;
    };

    return {
        id: node.path,
        label: node.name,
        type: isFolder ? ItemType.Folder : ItemType.File,
        expanded: false,
        children: isFolder
            ? allNodes
                  .filter(childrenNode => isChildrenRootNode(childrenNode.path))
                  .map(childrenNode =>
                      mapDocumentDriveNodeToTreeItem(childrenNode, allNodes)
                  )
            : undefined,
    };
}

function mapDocumentDriveToTreeItem(drive: Immutable<Drive>): DriveTreeItem {
    return {
        id: drive.id,
        label: drive.name,
        type: ItemType.LocalDrive,
        expanded: true,
        children: drive.nodes
            .filter(node => !node.path.includes('/'))
            .map(node => mapDocumentDriveNodeToTreeItem(node, drive.nodes)),
    };
}

interface DriveContainerProps {
    disableHoverStyles?: boolean;
    setDisableHoverStyles?: (value: boolean) => void;
}

export default function DriveContainer(props: DriveContainerProps) {
    const { disableHoverStyles = false, setDisableHoverStyles } = props;

    const [drives, setDrives] = useState<DriveTreeItem[]>([]);
    const {
        documentDrive,
        addFile,
        openFile,
        addFolder,
        deleteNode,
        renameNode,
        copyOrMoveNode,
    } = useDocumentDrive();

    useEffect(() => {
        const newItems = documentDrive?.state.drives.map(
            mapDocumentDriveToTreeItem
        );
        setDrives(newItems ?? []);
    }, [documentDrive]);

    function handleNodeClick(item: TreeItem, drive: DriveTreeItem) {
        if (item.type === ItemType.File) {
            openFile(drive.id, item.id);
        } else {
            setDrives(drives =>
                traverseDriveById(drives, drive.id, treeItem => {
                    if (treeItem.id === item.id) {
                        return {
                            ...treeItem,
                            expanded: !treeItem.expanded,
                        };
                    }

                    return treeItem;
                })
            );
        }
    }

    function addNewFolder(item: TreeItem, drive: DriveTreeItem) {
        const normalizedPath = item.id.replace(drive.id, '');
        const basePath = normalizedPath.split('/').slice(0, -1).join('/');

        const newPath = path.join(basePath, sanitizePath(item.label));

        if (newPath === '.') return cancelInputHandler();
        addFolder(drive.id, newPath, item.label);
    }

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
                    });
                }

                return { ...driveItem };
            });

            return newDrives;
        });
    }

    function updateItem(item: TreeItem, drive: DriveTreeItem) {
        setDrives(drives =>
            drives.map(_drive => {
                if (_drive.id !== drive.id) {
                    return _drive;
                }
                return traverseTree(drive, _item =>
                    _item.id !== item.id ? _item : item
                );
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

    async function updateNodeName(item: TreeItem, drive: DriveTreeItem) {
        renameNode(drive.id, item.id, item.label);
    }

    function submitInputHandler(item: TreeItem, drive: DriveTreeItem) {
        if (item.action === ActionType.New) {
            addNewFolder(item, drive);
            return;
        }

        updateNodeName(item, drive);
    }

    function cancelInputHandler() {
        const newItems = documentDrive?.state.drives.map(
            mapDocumentDriveToTreeItem
        );
        setDrives(newItems ?? []);
    }

    const handleItemOptionsClick: OnItemOptionsClickHandler = (
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

    const onDragStartHandler: DriveViewProps['onDragStart'] = () =>
        setDisableHoverStyles?.(true);

    const onDragEndHandler: DriveViewProps['onDragEnd'] = () =>
        setDisableHoverStyles?.(false);

    const onDropActivateHandler: DriveViewProps['onDropActivate'] = (
        drive,
        droptarget
    ) => {
        setDrives(drives =>
            traverseDriveById(drives, drive.id, treeItem => {
                if (treeItem.id === droptarget.id) {
                    return {
                        ...treeItem,
                        expanded: true,
                    };
                }

                return treeItem;
            })
        );
    };

    const onDropEventHandler: DriveViewProps['onDropEvent'] = async (
        item,
        target,
        event,
        drive
    ) => {
        const isDropAfter = !!item.dropAfterItem;
        const sortOptions: SortOptions | undefined = isDropAfter
            ? { afterNodePath: target.id }
            : undefined;

        let targetId =
            isDropAfter && !target.expanded
                ? path.dirname(target.id)
                : target.id;
        if (targetId === drive.id || targetId == '.') {
            targetId = '';
        }

        if (item.kind === 'object') {
            copyOrMoveNode(
                drive.id,
                item.data.id,
                targetId,
                event.dropOperation,
                sortOptions
            );
        } else if (item.kind === 'file') {
            const file = await item.getFile();
            addFile(file, drive.id, path.join(targetId, file.name));
        }
    };

    if (!documentDrive) {
        return null;
    }

    return (
        <DriveView
            type="local"
            name={documentDrive.name}
            drives={drives}
            onItemClick={(_, item, drive) => {
                handleNodeClick(item, drive);
            }}
            onItemOptionsClick={handleItemOptionsClick}
            onSubmitInput={submitInputHandler}
            onCancelInput={cancelInputHandler}
            onDragStart={onDragStartHandler}
            onDragEnd={onDragEndHandler}
            onDropEvent={onDropEventHandler}
            onDropActivate={onDropActivateHandler}
            disableHighlightStyles={disableHoverStyles}
        />
    );
}
