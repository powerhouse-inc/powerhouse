import {
    AddDriveInput,
    AddPublicDriveInput,
    BaseTreeItem,
    DriveView,
    DriveViewProps,
    decodeID,
    encodeID,
    getRootPath,
    useFilterPathContent,
    useItemActions,
    useItemsContext,
} from '@powerhousedao/design-system';
import { SharingType } from 'document-model-libs/document-drive';
import path from 'path';
import { useEffect } from 'react';
import {
    SortOptions,
    useDocumentDriveServer,
} from 'src/hooks/useDocumentDriveServer';
import {
    driveToBaseItems,
    useDrivesContainer,
} from 'src/hooks/useDrivesContainer';

interface DriveContainerProps {
    disableHoverStyles?: boolean;
    setDisableHoverStyles?: (value: boolean) => void;
}

function isPublicDriveInput(
    input: AddDriveInput | AddPublicDriveInput
): input is AddPublicDriveInput {
    return input.sharingType === 'PUBLIC';
}

const DriveSections = [
    { key: 'public', name: 'Public Drives', type: 'PUBLIC_DRIVE' },
    { key: 'cloud', name: 'Secure Cloud Drives', type: 'CLOUD_DRIVE' },
    { key: 'local', name: 'My Local Drives', type: 'LOCAL_DRIVE' },
] as const;

export default function DriveContainer(props: DriveContainerProps) {
    const { disableHoverStyles = false, setDisableHoverStyles } = props;
    const { setBaseItems } = useItemsContext();
    const actions = useItemActions();
    const filterPathContent = useFilterPathContent();

    const { documentDrives, addFile, copyOrMoveNode, addDrive } =
        useDocumentDriveServer();
    const { onItemOptionsClick, onItemClick, onSubmitInput } =
        useDrivesContainer();

    function updateBaseItems() {
        const baseItems: Array<BaseTreeItem> =
            documentDrives.reduce<Array<BaseTreeItem>>((acc, drive) => {
                return [...acc, ...driveToBaseItems(drive)];
            }, []) ?? [];
        setBaseItems(baseItems);
    }

    useEffect(() => {
        updateBaseItems();
    }, [documentDrives]);

    const cancelInputHandler: DriveViewProps['onCancelInput'] = item => {
        if (item.action === 'UPDATE') {
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

        const targetPath =
            isDropAfter && !target.expanded
                ? path.dirname(target.path)
                : target.path;

        let targetId = targetPath.split('/').pop() ?? '';

        if (targetId === driveID || targetId == '.') {
            targetId = '';
        }

        const decodedDriveID = decodeID(driveID);

        if (item.kind === 'object') {
            const filterPath = filterPathContent(
                treeItem =>
                    treeItem.label === item.data.label &&
                    treeItem.id !== item.data.id,
                { path: targetPath }
            );

            if (filterPath.length > 0) {
                actions.setExpandedItem(target.id, true);
                actions.newVirtualItem({
                    id: `(from)${item.data.id}`,
                    label: `${item.data.label} (2)`,
                    path: path.join(targetPath, encodeID(item.data.id)),
                    type: item.data.type,
                    action:
                        event.dropOperation === 'copy'
                            ? 'UPDATE_AND_COPY'
                            : 'UPDATE_AND_MOVE',
                });
                return;
            }

            copyOrMoveNode(
                decodedDriveID,
                item.data.id,
                decodeID(targetId),
                event.dropOperation,
                undefined,
                sortOptions
            );
        } else if (item.kind === 'file') {
            const file = await item.getFile();
            addFile(file, decodedDriveID, undefined, targetId);
        }
    };

    const onCreateDriveHandler: DriveViewProps['onCreateDrive'] = input => {
        addDrive({
            global: {
                id: isPublicDriveInput(input) ? input.id : '',
                icon: null,
                name: input.driveName,
                remoteUrl: isPublicDriveInput(input) ? input.url : null,
            },
            local: {
                availableOffline: input.availableOffline,
                sharingType: input.sharingType.toLowerCase() as SharingType,
            },
        });
    };

    return (
        <>
            {DriveSections.map(drive => (
                <DriveView
                    {...drive}
                    onItemClick={onItemClick}
                    onItemOptionsClick={onItemOptionsClick}
                    onSubmitInput={item => onSubmitInput(item)}
                    onCancelInput={cancelInputHandler}
                    onDragStart={onDragStartHandler}
                    onDragEnd={onDragEndHandler}
                    onDropEvent={onDropEventHandler}
                    onDropActivate={onDropActivateHandler}
                    onCreateDrive={onCreateDriveHandler}
                    disableHighlightStyles={disableHoverStyles}
                />
            ))}
        </>
    );
}
