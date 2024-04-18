import {
    TreeItem,
    UseDraggableTargetProps,
    decodeID,
    getRootPath,
} from '@powerhousedao/design-system';
import path from 'path';
import { useDocumentDriveServer } from 'src/hooks/useDocumentDriveServer';

export const useOnDropEvent = () => {
    const { copyNode, moveNode, addFile } = useDocumentDriveServer();

    const onDropEventHandler: UseDraggableTargetProps<TreeItem>['onDropEvent'] =
        async (item, target, event) => {
            const driveId = getRootPath(target.path);

            const isDropAfter = !!item.dropAfterItem;
            const isFileUpload = item.kind === 'file';

            // const sortOptions: SortOptions | undefined = isDropAfter
            //     ? { afterNodePath: target.id }
            //     : undefined;

            const targetPath =
                isDropAfter && !target.expanded
                    ? path.dirname(target.path)
                    : target.path;

            let targetId = targetPath.split('/').pop() ?? '';

            if (targetId === driveId || targetId == '.') {
                targetId = '';
            }

            const decodedDriveId = decodeID(driveId);
            const decodedTargetId = decodeID(targetId);

            if (isFileUpload) {
                const file = await item.getFile();

                await addFile(
                    file,
                    decodedDriveId,
                    undefined,
                    decodeID(targetId),
                );

                return;
            }

            if (target.type === 'FILE') {
                throw new Error('Cannot move a node into a file');
            }

            const isMoveOperation = event.dropOperation === 'move';
            const srcId = item.data.id;
            const srcName = item.data.label

            if (isMoveOperation) {
                await moveNode({
                    decodedDriveId,
                    srcId,
                    decodedTargetId,
                });

                return;
            }

            await copyNode({
                decodedDriveId,
                srcId,
                decodedTargetId,
                srcName,
            });
        };

    return onDropEventHandler;
};
