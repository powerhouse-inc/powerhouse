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
import { useAtom } from 'jotai';
import { useEffect, useState } from 'react';
import { useDocumentDrive } from 'src/hooks/useDocumentDrive';
import { sidebarDisableHoverStyles } from 'src/store';

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

export default function () {
    const [drives, setDrives] = useState<DriveTreeItem[]>([]);
    const [disableHoverStyles, setDisableHoverStyles] = useAtom(
        sidebarDisableHoverStyles
    );
    const {
        documentDrive,
        openFile,
        addFolder,
        deleteNode,
        renameNode,
        copyOrMoveNode,
    } = useDocumentDrive();

    useEffect(() => {
        console.log('documentDrive:drives', documentDrive?.state.drives);
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
        const basePath = item.id.replace(drive.id, '');
        // generate random number between 1 and 9999
        const num = Math.floor(Math.random() * 9999) + 1;

        addFolder(
            drive.id,
            `${basePath ? `${basePath}/` : ''}new-folder-${num}`, // TODO check if there is a new folder already
            'New Folder ' + num
        );
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

    const handleItemOptionsClick: OnItemOptionsClickHandler = (
        item,
        option,
        drive
    ) => {
        switch (option) {
            case 'new-folder':
                addNewFolder(item, drive);
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
        setDisableHoverStyles(true);

    const onDragEndHandler: DriveViewProps['onDragEnd'] = () =>
        setDisableHoverStyles(false);

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

    const onDropEventHandler: DriveViewProps['onDropEvent'] = (
        item,
        target,
        event,
        drive
    ) => {
        copyOrMoveNode(drive.id, item.data.id, target.id, event.dropOperation);
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
            onSubmitInput={updateNodeName}
            onDragStart={onDragStartHandler}
            onDragEnd={onDragEndHandler}
            onDropEvent={onDropEventHandler}
            onDropActivate={onDropActivateHandler}
            disableHighlightStyles={disableHoverStyles}
        />
    );
}
