import { UiNode, UseDraggableTargetProps } from '@powerhousedao/design-system';
import { useDocumentDriveServer } from 'src/hooks/useDocumentDriveServer';

export const useOnDropEvent = () => {
    const { copyNode, moveNode, addFile } = useDocumentDriveServer();

    const onDropEventHandler: UseDraggableTargetProps<UiNode | null>['onDropEvent'] =
        async (item, target, event) => {
            const isDropAfter = !!item.dropAfterItem;
            const isFileUpload = item.kind === 'file';
            // const sortOptions: SortOptions | undefined = isDropAfter
            //     ? { afterNodePath: target.id }
            //     : undefined;
            if (!target) return;

            if (isFileUpload) {
                const file = await item.getFile();
                await addFile(file, target.driveId, file.name, target.id);

                return;
            }

            if (item.data === null) return;

            const isMoveOperation = event.dropOperation === 'move';

            if (isMoveOperation) {
                await moveNode(item.data, target);
            } else {
                await copyNode(item.data, target);
            }
        };

    return onDropEventHandler;
};
