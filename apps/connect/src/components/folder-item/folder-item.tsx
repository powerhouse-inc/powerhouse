import {
    FolderItem as ConnectFolderItem,
    TreeItem,
    defaultDropdownMenuOptions,
} from '@powerhousedao/design-system';
import React, { useState } from 'react';
import { useModal } from 'src/components/modal';
import { useDrivesContainer } from 'src/hooks/useDrivesContainer';
import { useIsAllowedToCreateDocuments } from 'src/hooks/useIsAllowedToCreateDocuments';
import { useOnDropEvent } from 'src/hooks/useOnDropEvent';

const allowedItemOptions = ['delete', 'rename'];

const itemOptions = defaultDropdownMenuOptions.filter(option =>
    allowedItemOptions.includes(option.id),
);

export interface FolderItemProps {
    folder: TreeItem;
    decodedDriveID: string;
    onFolderSelected: (itemId: string) => void;
}

export const FolderItem: React.FC<FolderItemProps> = props => {
    const { folder, decodedDriveID, onFolderSelected } = props;
    const isAllowedToCreateDocuments = useIsAllowedToCreateDocuments();

    const { showModal } = useModal();
    const { updateNodeName } = useDrivesContainer();
    const [isWriteMode, setIsWriteMode] = useState(false);
    const onDropEvent = useOnDropEvent();

    const onFolderOptionsClick = (optionId: string, folderNode: TreeItem) => {
        if (optionId === 'delete') {
            showModal('deleteItem', {
                driveId: decodedDriveID,
                itemId: folderNode.id,
                itemName: folderNode.label,
                type: 'folder',
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
