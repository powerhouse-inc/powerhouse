import {
    ActionType,
    BaseTreeItem,
    DriveView,
    DriveViewProps,
    ItemType,
    decodeID,
    encodeID,
    getRootPath,
    useItemActions,
    useItemsContext,
} from '@powerhousedao/design-system';
import { DocumentDriveState, Node } from 'document-model-libs/document-drive';
import path from 'path';
import { useEffect } from 'react';
import {
    SortOptions,
    useDocumentDriveServer,
} from 'src/hooks/useDocumentDriveServer';
import { useDrivesContainer } from 'src/hooks/useDrivesContainer';

function driveToBaseItems(drive: DocumentDriveState): Array<BaseTreeItem> {
    const driveID = encodeID(drive.id);

    function getNodePath(node: Node, allNodes: Node[]): string {
        if (!node.parentFolder) {
            return '';
        }
        const parentNode = allNodes.find(
            _node => _node.id === node.parentFolder
        );
        if (!parentNode) {
            throw new Error('Invalid parent node');
        }
        return path.join(getNodePath(parentNode, allNodes), node.id);
    }

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

interface DriveContainerProps {
    disableHoverStyles?: boolean;
    setDisableHoverStyles?: (value: boolean) => void;
}

export default function DriveContainer(props: DriveContainerProps) {
    const { disableHoverStyles = false, setDisableHoverStyles } = props;
    const { setBaseItems } = useItemsContext();
    const actions = useItemActions();

    const { documentDrives, addFile, copyOrMoveNode } =
        useDocumentDriveServer();
    const { onItemOptionsClick, onItemClick, onSubmitInput } =
        useDrivesContainer();

    function updateBaseItems() {
        const baseItems: Array<BaseTreeItem> =
            documentDrives.reduce<Array<BaseTreeItem>>((acc, drive) => {
                return [...acc, ...driveToBaseItems(drive.state)];
            }, []) ?? [];

        setBaseItems(baseItems);
    }

    useEffect(() => {
        updateBaseItems();
    }, [documentDrives]);

    const cancelInputHandler: DriveViewProps['onCancelInput'] = item => {
        if (item.action === ActionType.Update) {
            actions.setItemAction(item.id, null);
            return;
        }

        actions.deleteVirtualItem(item.id);
    };

    const onDragStartHandler: DriveViewProps['onDragStart'] = () =>
        setDisableHoverStyles?.(true);

    const onDragEndHandler: DriveViewProps['onDragEnd'] = () =>
        setDisableHoverStyles?.(false);

    const onDropActivateHandler: DriveViewProps['onDropActivate'] =
        droptarget => {
            actions.setExpandedItem(droptarget.id, true);
        };

    const onDropEventHandler: DriveViewProps['onDropEvent'] = async (
        item,
        target,
        event
    ) => {
        const driveID = getRootPath(target.path);

        const isDropAfter = !!item.dropAfterItem;
        const sortOptions: SortOptions | undefined = isDropAfter
            ? { afterNodePath: target.id }
            : undefined;

        let targetId =
            isDropAfter && !target.expanded
                ? path.dirname(target.id)
                : target.id;

        if (targetId === driveID || targetId == '.') {
            targetId = '';
        }

        const decodedDriveID = decodeID(driveID);

        if (item.kind === 'object') {
            copyOrMoveNode(
                decodedDriveID,
                item.data.id,
                targetId,
                event.dropOperation,
                sortOptions
            );
        } else if (item.kind === 'file') {
            const file = await item.getFile();
            addFile(file, decodedDriveID, targetId);
        }
    };
    return (
        <>
            {documentDrives.map(drive => (
                <DriveView
                    key={drive.state.id}
                    type="local"
                    name={drive.state.name}
                    onItemClick={onItemClick}
                    onItemOptionsClick={onItemOptionsClick}
                    onSubmitInput={item => onSubmitInput(item)}
                    onCancelInput={cancelInputHandler}
                    onDragStart={onDragStartHandler}
                    onDragEnd={onDragEndHandler}
                    onDropEvent={onDropEventHandler}
                    onDropActivate={onDropActivateHandler}
                    disableHighlightStyles={disableHoverStyles}
                />
            ))}
        </>
    );
}
