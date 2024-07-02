import {
    ConnectDropdownMenuItem,
    TreeItem,
} from '@powerhousedao/design-system';
import React, { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { FileItem } from 'src/components/file-item';

import { useVirtualizer } from '@tanstack/react-virtual';
import { SetIsWriteMode } from 'src/hooks/useFileOptions';
import { useWindowSize } from 'src/hooks/useWindowSize';

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

const USED_SPACE = 420;

export const FileContentView: React.FC<IProps> = ({
    decodedDriveID,
    onFileDeleted,
    onFileSelected,

    files,
    fileItemOptions,
    onFileOptionsClick,
    isAllowedToCreateDocuments,
}) => {
    const parentRef = useRef(null);
    const { t } = useTranslation();
    const windowSize = useWindowSize();

    const availableWidth = windowSize.innerWidth - USED_SPACE;

    const columnCount = Math.floor(availableWidth / (ITEM_WIDTH + GAP)) || 1;
    const rowCount = Math.ceil(files.length / columnCount);

    const rowVirtualizer = useVirtualizer({
        count: rowCount,
        getScrollElement: () => parentRef.current,
        estimateSize: index => {
            if (index > 0) {
                return ITEM_HEIGHT + GAP;
            }
            return ITEM_HEIGHT;
        },
        overscan: 5,
    });

    const columnVirtualizer = useVirtualizer({
        horizontal: true,
        count: columnCount,
        getScrollElement: () => parentRef.current,
        estimateSize: index => {
            if (index > 0) {
                return ITEM_WIDTH + GAP;
            }
            return ITEM_WIDTH;
        },
        overscan: 5,
    });

    const getItemIndex = (rowIndex: number, columnIndex: number) =>
        rowIndex * columnCount + columnIndex;

    const getItem = (
        rowIndex: number,
        columnIndex: number,
    ): TreeItem | null => {
        const index = getItemIndex(rowIndex, columnIndex);
        return files[index] || null;
    };

    if (files.length < 1) {
        return (
            <div className="mb-8 text-sm text-gray-400">
                {t('folderView.sections.documents.empty')}
            </div>
        );
    }

    const renderItem = (rowIndex: number, columnIndex: number) => {
        const file = getItem(rowIndex, columnIndex);

        if (!file) {
            return null;
        }

        return (
            <div
                style={{
                    marginLeft: columnIndex === 0 ? 0 : GAP,
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
                    isAllowedToCreateDocuments={isAllowedToCreateDocuments}
                />
            </div>
        );
    };

    return (
        <div
            ref={parentRef}
            style={{
                height: `400px`,
                width: `100%`,
                overflow: 'auto',
            }}
        >
            <div
                style={{
                    height: `${rowVirtualizer.getTotalSize()}px`,
                    width: `${columnVirtualizer.getTotalSize()}px`,
                    position: 'relative',
                }}
            >
                {rowVirtualizer.getVirtualItems().map(virtualRow => (
                    <React.Fragment key={virtualRow.key}>
                        {columnVirtualizer
                            .getVirtualItems()
                            .map(virtualColumn => (
                                <div
                                    key={virtualColumn.key}
                                    style={{
                                        position: 'absolute',
                                        top: 0,
                                        left: 0,
                                        marginTop:
                                            virtualRow.index === 0 ? 0 : GAP,
                                        width: `${virtualColumn.size}px`,
                                        height: `${virtualRow.size}px`,
                                        transform: `translateX(${virtualColumn.start}px) translateY(${virtualRow.start}px)`,
                                    }}
                                >
                                    {renderItem(
                                        virtualRow.index,
                                        virtualColumn.index,
                                    )}
                                </div>
                            ))}
                    </React.Fragment>
                ))}
            </div>
        </div>
    );
};

export default FileContentView;
