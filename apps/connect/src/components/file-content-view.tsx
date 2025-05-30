import { useWindowSize } from '#hooks';
import {
    FileItem,
    type SharingType,
    type SyncStatus,
} from '@powerhousedao/design-system';
import {
    useNodeFileChildrenIds,
    useSelectedParentNodeId,
} from '@powerhousedao/reactor-browser';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { Node } from 'document-drive';
import React, { useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
type Props = {
    isAllowedToCreateDocuments?: boolean;
    sharingType: SharingType;
    getSyncStatusSync: (
        syncId: string,
        sharingType: SharingType,
    ) => SyncStatus | undefined;
    onAddFile: (
        file: File,
        parentNodeId: string | null,
        driveId: string | null,
    ) => Promise<void>;
    onMoveNode: (
        nodeId: string,
        targetNodeId: string,
        driveId: string,
    ) => Promise<void>;
    onCopyNode: (
        nodeId: string,
        targetNodeId: string,
        driveId: string,
    ) => Promise<void>;
    onRenameNode: (
        name: string,
        nodeId: string,
        driveId: string,
    ) => Promise<Node>;
    onDuplicateNode: (nodeId: string, driveId: string) => Promise<void>;
    showDeleteNodeModal: (nodeId: string) => void;
};

const GAP = 8;
const ITEM_WIDTH = 256;
const ITEM_HEIGHT = 48;

const USED_SPACE = 420;

export function FileContentView(props: Props) {
    const {
        sharingType,
        isAllowedToCreateDocuments = false,
        getSyncStatusSync,
        onAddFile,
        onMoveNode,
        onCopyNode,
        onRenameNode,
        onDuplicateNode,
        showDeleteNodeModal,
    } = props;
    const selectedParentNodeId = useSelectedParentNodeId();
    const parentRef = useRef(null);
    const { t } = useTranslation();
    const windowSize = useWindowSize();
    const fileNodeChildrenIds = useNodeFileChildrenIds(selectedParentNodeId);
    const availableWidth = windowSize.innerWidth - USED_SPACE;

    const columnCount = Math.floor(availableWidth / (ITEM_WIDTH + GAP)) || 1;
    const rowCount = Math.ceil(fileNodeChildrenIds.length / columnCount);

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

    const getItemIndex = useCallback(
        (rowIndex: number, columnIndex: number) =>
            rowIndex * columnCount + columnIndex,
        [columnCount],
    );

    const getItem = useCallback(
        (rowIndex: number, columnIndex: number) => {
            const index = getItemIndex(rowIndex, columnIndex);
            return fileNodeChildrenIds[index] || null;
        },
        [fileNodeChildrenIds],
    );

    if (fileNodeChildrenIds.length === 0) {
        return (
            <div className="mb-8 text-sm text-gray-400">
                {t('folderView.sections.documents.empty')}
            </div>
        );
    }

    const renderItem = useCallback(
        (rowIndex: number, columnIndex: number) => {
            const fileNodeId = getItem(rowIndex, columnIndex);

            if (!fileNodeId) {
                return null;
            }

            return (
                <div
                    style={{
                        marginLeft: columnIndex === 0 ? 0 : GAP,
                    }}
                >
                    <FileItem
                        key={fileNodeId}
                        nodeId={fileNodeId}
                        sharingType={sharingType}
                        getSyncStatusSync={getSyncStatusSync}
                        onRenameNode={onRenameNode}
                        onDuplicateNode={onDuplicateNode}
                        showDeleteNodeModal={showDeleteNodeModal}
                        isAllowedToCreateDocuments={isAllowedToCreateDocuments}
                    />
                </div>
            );
        },
        [
            fileNodeChildrenIds,
            isAllowedToCreateDocuments,
            onAddFile,
            onCopyNode,
            onDuplicateNode,
            onMoveNode,
            onRenameNode,
            showDeleteNodeModal,
        ],
    );

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
}

export default FileContentView;
