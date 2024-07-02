import {
    ConnectDropdownMenuItem,
    FileItem as ConnectFileItem,
    TreeItem,
} from '@powerhousedao/design-system';
import React, { useState } from 'react';
import { useDrivesContainer } from 'src/hooks/useDrivesContainer';
import { SetIsWriteMode } from 'src/hooks/useFileOptions';
import { useGetDocumentById } from 'src/hooks/useGetDocumentById';
import { useGetReadableItemPath } from 'src/hooks/useGetReadableItemPath';

interface IProps {
    file: TreeItem;
    decodedDriveID: string;
    onFileSelected: (drive: string, id: string) => void;
    onFileDeleted: (drive: string, id: string) => void;
    isAllowedToCreateDocuments: boolean;
    itemOptions?: ConnectDropdownMenuItem[];
    onFileOptionsClick?: (
        optionId: string,
        fileNode: TreeItem,
        setIsWriteMode: SetIsWriteMode,
    ) => Promise<void>;
}

export const FileItem: React.FC<IProps> = ({
    file,
    decodedDriveID,
    onFileSelected,
    itemOptions = [],
    isAllowedToCreateDocuments,
    onFileOptionsClick = () => {},
}) => {
    const [isWriteMode, setIsWriteMode] = useState(false);
    const getReadableItemPath = useGetReadableItemPath();
    const { updateNodeName } = useDrivesContainer();
    const getDocumentById = useGetDocumentById();
    const cancelInputHandler = () => setIsWriteMode(false);
    const submitInputHandler = (value: string) => {
        setIsWriteMode(false);
        updateNodeName({ ...file, label: value }, decodedDriveID);
    };
    const document = getDocumentById(decodedDriveID, file.id);
    const icon =
        document &&
        'documentType' in document &&
        document.documentType === 'makerdao/rwa-portfolio'
            ? 'rwaReport'
            : 'global';

    return (
        <ConnectFileItem
            displaySyncIcon
            key={file.id}
            title={file.label}
            subTitle={getReadableItemPath(file.id)}
            className="w-64"
            itemOptions={itemOptions}
            onCancelInput={cancelInputHandler}
            onSubmitInput={submitInputHandler}
            mode={isWriteMode ? 'write' : 'read'}
            onOptionsClick={optionId =>
                onFileOptionsClick(optionId, file, setIsWriteMode)
            }
            item={file}
            onClick={() =>
                !isWriteMode && onFileSelected(decodedDriveID, file.id)
            }
            isAllowedToCreateDocuments={isAllowedToCreateDocuments}
            icon={icon}
        />
    );
};

export default React.memo(FileItem, (prevProps, nextProps) => {
    return (
        prevProps.decodedDriveID === nextProps.decodedDriveID &&
        prevProps.file.id === nextProps.file.id &&
        prevProps.file.label === nextProps.file.label
    );
});
