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
import { useSelectedPath } from 'src/store';

interface DriveContainerProps {
    disableHoverStyles?: boolean;
    setDisableHoverStyles?: (value: boolean) => void;
}

function isPublicDriveInput(
    input: AddDriveInput | AddPublicDriveInput,
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
    const { setBaseItems, items } = useItemsContext();
    const actions = useItemActions();
    const filterPathContent = useFilterPathContent();
    const [selectedPath, setSelectedPath] = useSelectedPath();

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

    // Auto select first drive if there is no selected path
    useEffect(() => {
        if (!selectedPath && items.length > 0) {
            const driveID = documentDrives[0].state.global.id;

            setSelectedPath(encodeID(driveID));
            actions.setSelectedItem(driveID);
            actions.setExpandedItem(driveID, true);
        }
    }, [items, selectedPath]);

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
        event,
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
                { path: targetPath },
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
                sortOptions,
            ).catch(console.error);
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
                sharingType: input.sharingType.toLowerCase(),
                listeners: isPublicDriveInput(input)
                    ? [
                          {
                              block: true,
                              callInfo: {
                                  data: input.url,
                                  name: 'switchboard-push',
                                  transmitterType: 'SwitchboardPush',
                              },
                              filter: {
                                  branch: ['main'],
                                  documentId: ['*'],
                                  documentType: ['*'],
                                  scope: ['global'],
                              },
                              label: 'Switchboard Sync',
                              listenerId: '1',
                              system: true,
                          },
                      ]
                    : [],
            },
        }).catch(console.error);
    };

    return (
        <>
            {DriveSections.map(drive => (
                <DriveView
                    {...drive}
                    key={drive.name}
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
