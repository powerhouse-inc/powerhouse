import {
    TreeItem,
    defaultDropdownMenuOptions,
} from '@powerhousedao/design-system';
import { useModal } from 'src/components/modal';
import { useDrivesContainer } from 'src/hooks/useDrivesContainer';

const allowedItemOptions = ['delete', 'rename', 'duplicate'];

const folderItemOptions = defaultDropdownMenuOptions.filter(option =>
    allowedItemOptions.includes(option.id),
);

export type SetIsWriteMode = (isWriteMode: boolean) => void;

export function useFolderOptions(decodedDriveID: string) {
    const { showModal } = useModal();
    const { onSubmitInput } = useDrivesContainer();

    const onFolderOptionsClick = async (
        optionId: string,
        folderNode: TreeItem,
        setIsWriteMode: SetIsWriteMode,
    ) => {
        if (optionId === 'delete') {
            showModal('deleteItem', {
                driveId: decodedDriveID,
                itemId: folderNode.id,
                itemName: folderNode.label,
                type: 'folder',
            });
        }

        if (optionId === 'duplicate') {
            await onSubmitInput({
                ...folderNode,
                action: 'UPDATE_AND_COPY',
            });
        }

        if (optionId === 'rename') {
            setIsWriteMode(true);
        }
    };

    return {
        folderItemOptions,
        onFolderOptionsClick,
    };
}
