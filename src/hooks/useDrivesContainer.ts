import {
    ActionType,
    BaseTreeItem,
    DriveViewProps,
    ItemType,
    TreeItem,
    decodeID,
    encodeID,
    getRootPath,
    useItemActions,
} from '@powerhousedao/design-system';
import { DocumentDriveState, Node } from 'document-model-libs/document-drive';
import path from 'path';
import { useSelectedPath } from 'src/store';
import { getLastIndexFromPath, sanitizePath } from 'src/utils';
import { v4 as uuid } from 'uuid';
import { useDocumentDriveServer } from './useDocumentDriveServer';

export function getNodePath(node: Node, allNodes: Node[]): string {
    if (!node.parentFolder) {
        return encodeID(node.id);
    }
    const parentNode = allNodes.find(_node => _node.id === node.parentFolder);
    if (!parentNode) {
        throw new Error('Invalid parent node');
    }

    return path.join(getNodePath(parentNode, allNodes), encodeID(node.id));
}

export function driveToBaseItems(
    drive: DocumentDriveState
): Array<BaseTreeItem> {
    const driveID = encodeID(drive.id);

    const driveNode: BaseTreeItem = {
        id: driveID,
        label: drive.name,
        path: driveID,
        type: ItemType.LocalDrive,
    };

    const nodes: Array<BaseTreeItem> = drive.nodes.map((node, _i, nodes) => ({
        id: node.id,
        label: node.name,
        path: path.join(driveID, getNodePath(node, nodes)),
        type: node.kind === 'folder' ? ItemType.Folder : ItemType.File,
    }));
    return [driveNode, ...nodes];
}

export function useDrivesContainer() {
    const actions = useItemActions();
    const [, setSelectedPath] = useSelectedPath();

    const { openFile, addFolder, deleteNode, renameNode, documentDrives } =
        useDocumentDriveServer();

    function addVirtualNewFolder(item: TreeItem, driveID: string) {
        const driveNodes = documentDrives?.find(
            driveItem => driveItem.state.id === decodeID(driveID)
        )?.state.nodes;

        const parentFolder = item.path.split('/').slice(1).pop();
        const lastIndex = getLastIndexFromPath(
            [...(driveNodes || [])],
            'New Folder',
            parentFolder ? decodeID(parentFolder) : undefined
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
        const basePathComponents = item.path.split('/').slice(1, -1);
        const basePath = basePathComponents.join('/');
        const newPath = path.join(basePath, sanitizePath(item.label));

        // TODO is this needed?
        if (newPath === '.') return onCancel?.();
        const decodedDriveID = decodeID(driveID);
        const parentFolder = basePathComponents.pop();
        addFolder(
            decodedDriveID,
            item.label,
            parentFolder ? decodeID(parentFolder) : undefined
        );
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
