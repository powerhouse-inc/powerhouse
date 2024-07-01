import {
    ConnectDropdownMenuItem,
    TreeItem,
} from '@powerhousedao/design-system';
import { useTranslation } from 'react-i18next';
import AutoSizer from 'react-virtualized-auto-sizer';
import { VariableSizeGrid as Grid } from 'react-window';
import { FileItem } from 'src/components/file-item';

import { SetIsWriteMode } from 'src/hooks/useFileOptions';

interface IProps {
    decodedDriveID: string;
    onFileSelected: (drive: string, id: string) => void;
    onFileDeleted: (drive: string, id: string) => void;

    files: TreeItem[];
    fileItemOptions: ConnectDropdownMenuItem[];
    isAllowedToCreateDocuments: boolean;
    onFileOptionsClick: (
        optionId: string,
        fileNode: TreeItem,
        setIsWriteMode: SetIsWriteMode,
    ) => Promise<void>;
}

const GAP = 8;
const ITEM_WIDTH = 256;
const ITEM_HEIGHT = 48;

export const FileContentView: React.FC<IProps> = ({
    decodedDriveID,
    onFileDeleted,
    onFileSelected,

    files,
    fileItemOptions,
    onFileOptionsClick,
    isAllowedToCreateDocuments,
}) => {
    const { t } = useTranslation();

    if (files.length < 1) {
        return (
            <div className="mb-8 text-sm text-gray-400">
                {t('folderView.sections.documents.empty')}
            </div>
        );
    }

    return (
        <AutoSizer>
            {({ height, width }) => {
                const columnCount = Math.floor(width / (ITEM_WIDTH + GAP)) || 1;
                const rowCount = Math.ceil(files.length / columnCount);

                return (
                    <Grid
                        width={width}
                        height={height}
                        columnCount={columnCount}
                        columnWidth={index =>
                            index === columnCount - 1
                                ? ITEM_WIDTH
                                : ITEM_WIDTH + GAP
                        }
                        rowHeight={index =>
                            index === rowCount ? ITEM_HEIGHT : ITEM_HEIGHT + GAP
                        }
                        rowCount={rowCount}
                    >
                        {({ columnIndex, rowIndex, style }) => {
                            const itemIndex =
                                rowIndex * columnCount + columnIndex;
                            const file = files[itemIndex] || null;

                            if (!file) return null;

                            return (
                                <div
                                    style={{
                                        ...style,
                                        marginRight:
                                            columnIndex === columnCount - 1
                                                ? 0
                                                : GAP,
                                    }}
                                >
                                    <FileItem
                                        key={file.id}
                                        file={file}
                                        decodedDriveID={decodedDriveID}
                                        onFileDeleted={onFileDeleted}
                                        onFileSelected={onFileSelected}
                                        itemOptions={fileItemOptions}
                                        onFileOptionsClick={onFileOptionsClick}
                                        isAllowedToCreateDocuments={
                                            isAllowedToCreateDocuments
                                        }
                                    />
                                </div>
                            );
                        }}
                    </Grid>
                );
            }}
        </AutoSizer>
    );
};

export default FileContentView;
