import {
    ConnectDropdownMenuItem,
    FolderItem as ConnectFolderItem,
    TreeItem,
} from '@powerhousedao/design-system';
import React, { useState } from 'react';
import { useDrivesContainer } from 'src/hooks/useDrivesContainer';
import { SetIsWriteMode } from 'src/hooks/useFolderOptions';
import { useOnDropEvent } from 'src/hooks/useOnDropEvent';

export interface FolderItemProps {
    folder: TreeItem;
    decodedDriveID: string;
    onFolderSelected: (itemId: string) => void;
    isAllowedToCreateDocuments: boolean;
    folderItemOptions: ConnectDropdownMenuItem[];
    onFolderOptionsClick?: (
        optionId: string,
        fileNode: TreeItem,
        setIsWriteMode: SetIsWriteMode,
    ) => Promise<void>;
}

export const FolderItem: React.FC<FolderItemProps> = props => {
    const {
        folder,
        decodedDriveID,
        onFolderSelected,
        folderItemOptions,
        onFolderOptionsClick = () => {},
        isAllowedToCreateDocuments,
    } = props;

    const { updateNodeName } = useDrivesContainer();
    const [isWriteMode, setIsWriteMode] = useState(false);
    const onDropEvent = useOnDropEvent();

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
            itemOptions={folderItemOptions}
            onCancelInput={cancelInputHandler}
            onSubmitInput={submitInputHandler}
            mode={isWriteMode ? 'write' : 'read'}
            onClick={() => !isWriteMode && onFolderSelected(folder.id)}
            onOptionsClick={optionId =>
                onFolderOptionsClick(optionId, folder, setIsWriteMode)
            }
            onDropEvent={onDropEvent}
            item={folder}
            isAllowedToCreateDocuments={isAllowedToCreateDocuments}
        />
    );
};
