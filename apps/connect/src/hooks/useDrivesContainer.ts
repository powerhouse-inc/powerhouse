import {
    BaseTreeItem,
    CLOUD_DRIVE,
    DriveTreeItem,
    DriveViewProps,
    LOCAL_DRIVE,
    PUBLIC_DRIVE,
    TreeItem,
    SharingType as TreeItemSharingType,
    decodeID,
    encodeID,
    getFolderStatus,
    getRootPath,
    removeSuccessFiles,
    sortFilesByStatus,
    toast,
    useItemActions,
} from '@powerhousedao/design-system';
import {
    DocumentDriveDocument,
    FileNode,
    FolderNode,
    Node,
} from 'document-model-libs/document-drive';
import path from 'path';
import { useTranslation } from 'react-i18next';
import { useModal } from 'src/components/modal';
import { getLastIndexFromPath } from 'src/utils';
import { v4 as uuid } from 'uuid';
import { useDocumentDriveServer } from './useDocumentDriveServer';
import { useNavigateToItemId } from './useNavigateToItemId';

export function getNodePath(
    node: Node,
    allNodes: Node[],
    visited = new Set<string>(),
): string {
    if (visited.has(node.id)) {
        throw new Error(`Circular reference detected at node ${node.id}`);
    }

    visited.add(node.id);

    if (!node.parentFolder) {
        return encodeID(node.id);
    }
    const parentNode = allNodes.find(_node => _node.id === node.parentFolder);
    if (!parentNode) {
        throw new Error(`Invalid parent node ${node.parentFolder}`);
    }

    // Recursive call to get the path for the parent node
    const parentPath = getNodePath(parentNode, allNodes, visited);

    return path.join(parentPath, encodeID(node.id));
}

function getDriveBaseItemType(sharingType: string) {
    switch (sharingType.toLowerCase()) {
        case 'public':
            return PUBLIC_DRIVE;
        case 'shared':
            return CLOUD_DRIVE;
        default:
            return LOCAL_DRIVE;
    }
}

export function useDrivesContainer() {
    const actions = useItemActions();
    const { showModal } = useModal();
    const { t } = useTranslation();
    const navigateToItemId = useNavigateToItemId();

    const {
        addFolder,
        renameNode,
        deleteDrive,
        renameDrive,
        setDriveAvailableOffline,
        setDriveSharingType,
        documentDrives,
        copyNode,
        moveNode,
        getSyncStatus,
    } = useDocumentDriveServer();

    function addVirtualNewFolder(item: TreeItem, driveID: string) {
        const driveNodes = documentDrives.find(
            driveItem => driveItem.state.global.id === decodeID(driveID),
        )?.state.global.nodes;

        const parentFolder = item.path.split('/').slice(1).pop();
        const lastIndex = getLastIndexFromPath(
            [...(driveNodes || [])],
            'New Folder',
            parentFolder ? decodeID(parentFolder) : undefined,
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
            sharingType: item.sharingType,
            availableOffline: item.availableOffline,
        });
    }

    async function addNewFolder(item: TreeItem, driveID: string) {
        const basePathComponents = item.path.split('/').slice(1, -1);

        const decodedDriveID = decodeID(driveID);
        const parentFolder = basePathComponents.pop();
        await addFolder(
            decodedDriveID,
            item.label,
            parentFolder ? decodeID(parentFolder) : undefined,
        );
    }

    const onItemClick: DriveViewProps['onItemClick'] = (_event, item) => {
        if (item.type !== 'FILE') {
            actions.toggleExpandedAndSelect(item.id);
            navigateToItemId(item.id);
        }
    };

    const onItemOptionsClick: DriveViewProps['onItemOptionsClick'] = async (
        item,
        option,
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
                    ['PUBLIC_DRIVE', 'LOCAL_DRIVE', 'CLOUD_DRIVE'].includes(
                        item.type,
                    )
                ) {
                    showModal('deleteDriveModal', {
                        onCancel: closeModal => closeModal(),
                        driveName: item.label,
                        onDelete: async closeModal => {
                            closeModal();
                            await deleteDrive(decodeID(item.id));

                            toast(t('notifications.deleteDriveSuccess'), {
                                type: 'connect-deleted',
                            });
                        },
                    });
                } else {
                    showModal('deleteItem', {
                        itemId: decodeID(item.id),
                        itemName: item.label,
                        driveId: decodeID(driveID),
                        type: item.type === 'FOLDER' ? 'folder' : 'file',
                    });
                }
                break;
            case 'delete-drive':
                await deleteDrive(decodeID(item.id));
                break;
            case 'rename-drive':
                await renameDrive(decodeID(item.id), item.label);
                break;
            case 'change-availability':
                await setDriveAvailableOffline(
                    decodeID(item.id),
                    item.availableOffline,
                );
                break;
            case 'change-sharing-type':
                await setDriveSharingType(
                    decodeID(item.id),
                    item.sharingType?.toLowerCase() as TreeItemSharingType,
                );
                break;
            case 'duplicate':
                await onSubmitInput({
                    ...item,
                    action: 'UPDATE_AND_COPY',
                });
        }
    };

    async function updateNodeName(item: TreeItem, driveID: string) {
        const decodedDriveID = decodeID(driveID);
        await renameNode(decodedDriveID, item.id, item.label);
    }

    async function onSubmitInput(item: TreeItem, onCancel?: () => void) {
        const driveId = getRootPath(item.path);

        const isCreateNewOperation = item.action === 'NEW';
        const isMoveOperation = item.action === 'UPDATE_AND_MOVE';
        const isCopyOperation = item.action === 'UPDATE_AND_COPY';

        if (isCreateNewOperation) {
            actions.deleteVirtualItem(item.id);
            await addNewFolder(item, driveId);
            return;
        }

        const srcId = item.id;
        const srcName = item.label;
        const targetPath = path.dirname(item.path);
        let targetId = targetPath.split('/').pop() ?? '';

        if (targetId === driveId || targetId == '.') {
            targetId = '';
        }

        const decodedDriveId = decodeID(driveId);
        const decodedTargetId = decodeID(targetId);

        if (isMoveOperation) {
            await moveNode({
                decodedDriveId,
                srcId,
                decodedTargetId,
            });

            return;
        }

        if (isCopyOperation) {
            await copyNode({
                decodedDriveId,
                srcId,
                decodedTargetId,
                srcName,
            });

            return;
        }

        actions.setItemAction(item.id, null);

        if (item.label === '') {
            onCancel?.();
            return;
        }

        await updateNodeName(item, driveId);
    }

    async function driveToBaseItems(drive: DocumentDriveDocument) {
        const driveID = encodeID(drive.state.global.id);
        const { id, name, icon } = drive.state.global;
        const { sharingType, availableOffline } = drive.state.local;
        const driveBaseItemType = getDriveBaseItemType(sharingType || '');
        const driveNode: DriveTreeItem = {
            id: id,
            label: name,
            path: driveID,
            type: driveBaseItemType,
            icon,
            sharingType: sharingType?.toUpperCase() as TreeItemSharingType,
            availableOffline,
            syncStatus: await getSyncStatus(driveID, driveBaseItemType),
        };

        const { files, folders } = drive.state.global.nodes.reduce(
            (acc, node) => {
                if (node.kind === 'folder') {
                    acc.folders.push(node);
                } else {
                    acc.files.push(node as FileNode);
                }

                return acc;
            },
            {
                files: [] as FileNode[],
                folders: [] as FolderNode[],
            },
        );

        const driveNodes = drive.state.global.nodes;

        const fileItems: Array<BaseTreeItem> = await Promise.all(
            files.map(async node => ({
                id: node.id,
                label: node.name,
                path: path.join(driveID, getNodePath(node, driveNodes)),
                type: node.kind === 'folder' ? 'FOLDER' : 'FILE',
                sharingType: sharingType?.toUpperCase() as TreeItemSharingType,
                availableOffline,
                syncStatus: await getSyncStatus(
                    node.synchronizationUnits[0].syncId,
                    driveBaseItemType,
                ),
            })),
        );

        const filesStatus = sortFilesByStatus(
            removeSuccessFiles(
                fileItems.map(file => ({
                    path: file.path,
                    status: file.syncStatus,
                })),
            ),
        );

        const folderItems: Array<BaseTreeItem> = folders.map(node => {
            const folderPath = path.join(
                driveID,
                getNodePath(node, driveNodes),
            );

            return {
                id: node.id,
                label: node.name,
                path: folderPath,
                type: 'FOLDER',
                sharingType: sharingType?.toUpperCase() as TreeItemSharingType,
                availableOffline,
                syncStatus: getFolderStatus(folderPath, filesStatus),
            };
        });

        return [driveNode, ...fileItems, ...folderItems];
    }

    return {
        onItemClick,
        onItemOptionsClick,
        onSubmitInput,
        updateNodeName,
        driveToBaseItems,
    };
}
