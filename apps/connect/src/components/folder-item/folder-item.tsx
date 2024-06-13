import {
    FolderItem as ConnectFolderItem,
    TreeItem,
    defaultDropdownMenuOptions,
} from '@powerhousedao/design-system';
import React, { useState } from 'react';
import { useModal } from 'src/components/modal';
import { useDrivesContainer } from 'src/hooks/useDrivesContainer';
import { useOnDropEvent } from 'src/hooks/useOnDropEvent';

const allowedItemOptions = ['delete', 'rename', 'duplicate'];

const itemOptions = defaultDropdownMenuOptions.filter(option =>
    allowedItemOptions.includes(option.id),
);

export interface FolderItemProps {
    folder: TreeItem;
    decodedDriveID: string;
    onFolderSelected: (itemId: string) => void;
    isAllowedToCreateDocuments: boolean;
}

export const FolderItem: React.FC<FolderItemProps> = props => {
    const {
        folder,
        decodedDriveID,
        onFolderSelected,
        isAllowedToCreateDocuments,
    } = props;

    const { showModal } = useModal();
    const { updateNodeName, onSubmitInput } = useDrivesContainer();
    const [isWriteMode, setIsWriteMode] = useState(false);
    const onDropEvent = useOnDropEvent();

    // TODO: move this to folder-view
    const onFolderOptionsClick = async (
        optionId: string,
        folderNode: TreeItem,
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
                ...folder,
                action: 'UPDATE_AND_COPY',
            });
        }

        if (optionId === 'rename') {
            setIsWriteMode(true);
        }
    };

    const cancelInputHandler = () => setIsWriteMode(false);
    const submitInputHandler = (value: string) => {
        setIsWriteMode(false);
        updateNodeName({ ...folder, label: value }, decodedDriveID);
    };

    return (
        <ConnectFolderItem
            className="w-64"
            displaySyncIcon
            title={folder.label}
            itemOptions={itemOptions}
            onCancelInput={cancelInputHandler}
            onSubmitInput={submitInputHandler}
            mode={isWriteMode ? 'write' : 'read'}
            onClick={() => !isWriteMode && onFolderSelected(folder.id)}
            onOptionsClick={optionId => onFolderOptionsClick(optionId, folder)}
            onDropEvent={onDropEvent}
            item={folder}
            isAllowedToCreateDocuments={isAllowedToCreateDocuments}
        />
    );
};
