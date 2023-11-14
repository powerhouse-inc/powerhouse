import {
    DriveTreeItem,
    DriveView,
    DriveViewProps,
    ItemType,
    TreeItem,
    traverseDriveById,
} from '@powerhousedao/design-system';
import { Drive, Node } from 'document-model-libs/document-drive';
import { Immutable } from 'document-model/document';
import path from 'path';
import { useEffect } from 'react';
import {
    isChildrenRootNode,
    useDocumentDrive,
} from 'src/hooks/useDocumentDrive';
import { useDrivesContainer } from 'src/hooks/useDrivesContainer';
import { SortOptions } from 'src/services/document-drive';
import { useDrives } from 'src/store';

function findNodeById(id: string, treeItem: TreeItem): TreeItem | undefined {
    if (treeItem.id === id) {
        return treeItem;
    }

    return treeItem.children?.find(item => findNodeById(id, item));
}

function mapDocumentDriveNodeToTreeItem<T extends string>(
    node: Immutable<Node>,
    allNodes: Immutable<Array<Node>>,
    treeItem?: TreeItem
): TreeItem<T> {
    const isFolder = node.kind === 'folder';

    return {
        id: node.path,
        label: node.name,
        type: isFolder ? ItemType.Folder : ItemType.File,
        expanded: treeItem?.expanded,
        isSelected: treeItem?.isSelected,
        children: isFolder
            ? allNodes
                  .filter(childrenNode =>
                      isChildrenRootNode(node.path, childrenNode.path)
                  )
                  .map(childrenNode =>
                      mapDocumentDriveNodeToTreeItem(
                          childrenNode,
                          allNodes,
                          treeItem
                              ? findNodeById(node.path, treeItem)
                              : undefined
                      )
                  )
            : undefined,
    };
}

function mapDocumentDriveToTreeItem(
    drive: Immutable<Drive>,
    treeItem?: DriveTreeItem
): DriveTreeItem {
    const nodes = drive.nodes.filter(
        node => !node.path.includes('/') && node.kind === 'folder'
    );
    return {
        id: drive.id,
        label: drive.name,
        type: ItemType.LocalDrive,
        expanded: treeItem?.expanded ?? true,
        isSelected: treeItem?.isSelected ?? false,
        children: nodes.map(node =>
            mapDocumentDriveNodeToTreeItem(
                node,
                drive.nodes.filter(node => node.kind === 'folder'),
                treeItem ? findNodeById(node.path, treeItem) : undefined
            )
        ),
    };
}

interface DriveContainerProps {
    disableHoverStyles?: boolean;
    setDisableHoverStyles?: (value: boolean) => void;
}

export default function DriveContainer(props: DriveContainerProps) {
    const { disableHoverStyles = false, setDisableHoverStyles } = props;

    const [drives, setDrives] = useDrives();
    const { documentDrive, addFile, copyOrMoveNode } = useDocumentDrive();
    const { onItemOptionsClick, onItemClick, onSubmitInput } =
        useDrivesContainer();

    function updateDrives() {
        setDrives(oldItems => {
            const newItems = documentDrive?.state.drives.map(drive =>
                mapDocumentDriveToTreeItem(
                    drive
                    // oldItems.find(item => item.id === drive.id) TODO keep expanded/selected state
                )
            );
            return newItems ?? [];
        });
    }

    useEffect(() => {
        updateDrives();
    }, [documentDrive]);

    function cancelInputHandler() {
        updateDrives();
    }

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
            addFile(file, drive.id, targetId);
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
            onItemClick={onItemClick}
            onItemOptionsClick={onItemOptionsClick}
            onSubmitInput={(item, drive) =>
                onSubmitInput(item, drive, cancelInputHandler)
            }
            onCancelInput={cancelInputHandler}
            onDragStart={onDragStartHandler}
            onDragEnd={onDragEndHandler}
            onDropEvent={onDropEventHandler}
            onDropActivate={onDropActivateHandler}
            disableHighlightStyles={disableHoverStyles}
        />
    );
}
