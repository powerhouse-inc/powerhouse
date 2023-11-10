import {
    ActionType,
    DriveTreeItem,
    DriveView,
    ItemType,
    OnItemOptionsClickHandler,
    TreeItem,
    traverseTree,
} from '@powerhousedao/design-system';
import { Drive, Node } from 'document-model-libs/document-drive';
import { Immutable } from 'document-model/document';
import { useEffect, useState } from 'react';
import { useDocumentDrive } from 'src/hooks/useDocumentDrive';

function mapDocumentDriveNodeToTreeItem(
    node: Immutable<Node>,
    allNodes: Immutable<Array<Node>>
): TreeItem {
    const isFolder = node.kind === 'folder';
    const pathRegex = new RegExp(`^${node.path}/[^/]+`);

    return {
        id: node.path,
        label: node.name,
        type: isFolder ? ItemType.Folder : ItemType.File,
        children: isFolder
            ? allNodes
                  .filter(childrenNode => pathRegex.test(childrenNode.path))
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
    const { documentDrive, openFile, addFolder, deleteNode, renameNode } =
        useDocumentDrive();

    useEffect(() => {
        const newItems = documentDrive?.state.drives.map(
            mapDocumentDriveToTreeItem
        );
        setDrives(newItems ?? []);
    }, [documentDrive]);

    function handleNodeClick(item: TreeItem, drive: DriveTreeItem) {
        if (item.type === ItemType.File) {
            openFile(drive.id, item.id);
        }
    }

    function addNewFolder(item: TreeItem, drive: DriveTreeItem) {
        const basePath = item.id.replace(drive.id, '');
        addFolder(
            drive.id,
            `${basePath ? `${basePath}/` : ''}new-folder`, // TODO check if there is a new folder already
            'New Folder'
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
        />
    );
}
