import { useShowDeleteNodeModal, useWindowSize, type TUiNodes } from '#hooks';
import {
    FileItem,
    type BaseUiFileNode,
    type UiFileNode,
    type UiNode,
} from '@powerhousedao/design-system';
import { useUiNodesContext } from '@powerhousedao/reactor-browser';
import { useVirtualizer } from '@tanstack/react-virtual';
import React, { useRef } from 'react';
import { useTranslation } from 'react-i18next';

type Props = TUiNodes & {
    isAllowedToCreateDocuments?: boolean;
    fileNodes: UiFileNode[];
};

const GAP = 8;
const ITEM_WIDTH = 256;
const ITEM_HEIGHT = 48;

const USED_SPACE = 420;

export function FileContentView(props: Props) {
    const parentRef = useRef(null);
    const { t } = useTranslation();
    const windowSize = useWindowSize();
    const { fileNodes } = props;
    const availableWidth = windowSize.innerWidth - USED_SPACE;
    const { setSelectedNode } = useUiNodesContext();
    const showDeleteNodeModal = useShowDeleteNodeModal();
    const handleSelectNode = (node: BaseUiFileNode) => {
        setSelectedNode(node as unknown as UiFileNode);
    };

    const handleRenameNode = (name: string, node: BaseUiFileNode) => {
        props.onRenameNode(name, node as unknown as UiFileNode);
    };

    const handleDuplicateNode = (node: BaseUiFileNode) => {
        props.onDuplicateNode(node as unknown as UiFileNode);
    };

    const handleDeleteNode = (node: BaseUiFileNode) => {
        showDeleteNodeModal(node as unknown as UiFileNode);
    };

    const handleAddFile = (file: File, parentNode: BaseUiFileNode | null) => {
        props.onAddFile(file, parentNode as UiNode | null);
    };

    const handleCopyNode = (
        node: BaseUiFileNode,
        targetNode: BaseUiFileNode,
    ) => {
        props.onCopyNode(node as UiNode, targetNode as UiNode);
    };

    const handleMoveNode = (
        node: BaseUiFileNode,
        targetNode: BaseUiFileNode,
    ) => {
        props.onMoveNode(node as UiNode, targetNode as UiNode);
    };

    const columnCount = Math.floor(availableWidth / (ITEM_WIDTH + GAP)) || 1;
    const rowCount = Math.ceil(fileNodes.length / columnCount);

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
    ): UiFileNode | null => {
        const index = getItemIndex(rowIndex, columnIndex);
        return fileNodes[index] || null;
    };

    if (fileNodes.length === 0) {
        return (
            <div className="mb-8 text-sm text-gray-400">
                {t('folderView.sections.documents.empty')}
            </div>
        );
    }

    const renderItem = (rowIndex: number, columnIndex: number) => {
        const fileNode = getItem(rowIndex, columnIndex);

        if (!fileNode) {
            return null;
        }

        return (
            <div
                style={{
                    marginLeft: columnIndex === 0 ? 0 : GAP,
                }}
            >
                <FileItem
                    key={fileNode.id}
                    uiNode={fileNode}
                    onSelectNode={handleSelectNode}
                    onRenameNode={handleRenameNode}
                    onDuplicateNode={handleDuplicateNode}
                    onDeleteNode={handleDeleteNode}
                    isAllowedToCreateDocuments={
                        props.isAllowedToCreateDocuments ?? false
                    }
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
}

export default FileContentView;
