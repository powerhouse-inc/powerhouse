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
import { Drive } from 'document-model-libs/document-drive';
import path from 'path';
import { useEffect } from 'react';
import { useDocumentDrive } from 'src/hooks/useDocumentDrive';
import { useDrivesContainer } from 'src/hooks/useDrivesContainer';
import { SortOptions } from 'src/services/document-drive';

function driveToBaseItems(drive: Drive): Array<BaseTreeItem> {
    const driveID = encodeID(drive.id);

    const driveNode: BaseTreeItem = {
        id: driveID,
        label: drive.name,
        path: driveID,
        type: ItemType.LocalDrive,
    };

    const nodes: Array<BaseTreeItem> = drive.nodes.map(node => ({
        id: node.path,
        label: node.name,
        path: path.join(driveID, node.path),
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
    const { setBaseItems, baseItems } = useItemsContext();
    const actions = useItemActions();

    const { documentDrive, addFile, copyOrMoveNode } = useDocumentDrive();
    const { onItemOptionsClick, onItemClick, onSubmitInput } =
        useDrivesContainer();

    console.log('documentDrive', documentDrive);
    console.log('baseItems', baseItems);

    function updateBaseItems() {
        const baseItems: Array<BaseTreeItem> =
            documentDrive?.state.drives.reduce<Array<BaseTreeItem>>(
                (acc, drive) => {
                    return [...acc, ...driveToBaseItems(drive as Drive)];
                },
                []
            ) ?? [];

        setBaseItems(baseItems);
    }

    useEffect(() => {
        updateBaseItems();
    }, [documentDrive]);

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

    if (!documentDrive) {
        return null;
    }

    return (
        <DriveView
            type="local"
            name={documentDrive.name}
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
    );
}
