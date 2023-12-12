import {
    BaseTreeItem,
    DriveViewProps,
    TreeItem,
    decodeID,
    encodeID,
    getRootPath,
    useItemActions,
} from '@powerhousedao/design-system';
import { DocumentDriveState, Node } from 'document-model-libs/document-drive';
import path from 'path';
import { useModal } from 'src/components/modal';
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
        throw new Error(`Invalid parent node ${node.parentFolder}`);
    }

    return path.join(getNodePath(parentNode, allNodes), encodeID(node.id));
}

export function driveToBaseItems(
    drive: DocumentDriveState
): Array<BaseTreeItem> {
    const driveID = encodeID(drive.id);

    const driveNode: BaseTreeItem = {
        id: drive.id,
        label: drive.name,
        path: driveID,
        type: 'LOCAL_DRIVE',
    };

    const nodes: Array<BaseTreeItem> = drive.nodes.map((node, _i, nodes) => ({
        id: node.id,
        label: node.name,
        path: path.join(driveID, getNodePath(node, nodes)),
        type: node.kind === 'folder' ? 'FOLDER' : 'FILE',
    }));
    return [driveNode, ...nodes];
}

export function useDrivesContainer() {
    const actions = useItemActions();
    const { showModal } = useModal();
    const [, setSelectedPath] = useSelectedPath();

    const {
        addFolder,
        renameNode,
        deleteDrive,
        renameDrive,
        documentDrives,
        copyOrMoveNode,
    } = useDocumentDriveServer();

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
            type: 'FOLDER',
            action: 'NEW',
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
        if (item.type !== 'FILE') {
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
                actions.setItemAction(item.id, 'UPDATE');
                break;
            case 'delete':
                if (
                    ['cloud-drive', 'local-drive', 'public-drive'].includes(
                        item.type
                    )
                ) {
                    deleteDrive(decodeID(item.id));
                } else {
                    showModal('deleteItem', {
                        itemId: item.id,
                        itemName: item.label,
                        driveId: decodeID(driveID),
                    });
                }
                break;
            case 'delete-drive':
                deleteDrive(decodeID(item.id));
                break;
            case 'rename-drive':
                renameDrive(decodeID(item.id), item.label);
                break;
        }
    };

    async function updateNodeName(item: TreeItem, driveID: string) {
        const decodedDriveID = decodeID(driveID);
        renameNode(decodedDriveID, item.id, item.label);
    }

    const onSubmitInput = (item: TreeItem, onCancel?: () => void) => {
        const driveID = item.path.split('/')[0];

        if (item.action === 'NEW') {
            actions.deleteVirtualItem(item.id);
            addNewFolder(item, driveID, onCancel);
            return;
        }

        if (
            item.action === 'UPDATE_AND_COPY' ||
            item.action === 'UPDATE_AND_MOVE'
        ) {
            actions.deleteVirtualItem(item.id);

            const driveID = getRootPath(item.path);
            const srcID = item.id.replace('(from)', '');
            const targetPath = path.dirname(item.path);
            const operation =
                item.action === 'UPDATE_AND_COPY' ? 'copy' : 'move';

            let targetId = targetPath.split('/').pop() ?? '';

            if (targetId === driveID || targetId == '.') {
                targetId = '';
            }

            copyOrMoveNode(
                decodeID(driveID),
                srcID,
                decodeID(targetId),
                operation,
                item.label
            );
            return;
        }

        actions.setItemAction(item.id, null);

        if (item.label === '') {
            onCancel?.();
            return;
        }

        updateNodeName(item, driveID);
    };

    return {
        onItemClick,
        onItemOptionsClick,
        onSubmitInput,
    };
}
