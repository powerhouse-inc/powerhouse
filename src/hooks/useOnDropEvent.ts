import {
    TreeItem,
    UseDraggableTargetProps,
    decodeID,
    encodeID,
    getRootPath,
    useFilterPathContent,
    useItemActions,
} from '@powerhousedao/design-system';
import path from 'path';
import {
    SortOptions,
    useDocumentDriveServer,
} from 'src/hooks/useDocumentDriveServer';

export const useOnDropEvent = () => {
    const { copyOrMoveNode, addFile } = useDocumentDriveServer();
    const actions = useItemActions();
    const filterPathContent = useFilterPathContent();

    const onDropEventHandler: UseDraggableTargetProps<TreeItem>['onDropEvent'] =
        async (item, target, event) => {
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
                        sharingType: item.data.sharingType,
                        availableOffline: item.data.availableOffline,
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
            } else {
                const file = await item.getFile();
                await addFile(
                    file,
                    decodedDriveID,
                    undefined,
                    decodeID(targetId),
                );
            }
        };

    return onDropEventHandler;
};
