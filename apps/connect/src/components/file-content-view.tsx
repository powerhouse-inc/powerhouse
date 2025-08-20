import { useNodeActions, useShowDeleteNodeModal, useWindowSize } from "#hooks";
import { FileItem } from "@powerhousedao/design-system";
import {
  getSyncStatusSync,
  setSelectedNode,
  useSelectedDriveSharingType,
} from "@powerhousedao/reactor-browser";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { FileNode } from "document-drive";
import React, { useRef } from "react";
import { useTranslation } from "react-i18next";

type Props = {
  isAllowedToCreateDocuments?: boolean;
  fileNodes: FileNode[];
};

const GAP = 8;
const ITEM_WIDTH = 256;
const ITEM_HEIGHT = 48;

const USED_SPACE = 420;

export function FileContentView({
  fileNodes,
  isAllowedToCreateDocuments,
}: Props) {
  const parentRef = useRef(null);
  const { t } = useTranslation();
  const windowSize = useWindowSize();
  const sharingType = useSelectedDriveSharingType();
  const {
    onRenameNode,
    onDuplicateNode,
    onMoveNode,
    onCopyNode,
    onAddFile,
    onAddFolder,
    onAddAndSelectNewFolder,
  } = useNodeActions();
  const availableWidth = windowSize.innerWidth - USED_SPACE;
  const showDeleteNodeModal = useShowDeleteNodeModal();

  const columnCount = Math.floor(availableWidth / (ITEM_WIDTH + GAP)) || 1;
  const rowCount = Math.ceil(fileNodes.length / columnCount);

  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => {
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
    estimateSize: (index) => {
      if (index > 0) {
        return ITEM_WIDTH + GAP;
      }
      return ITEM_WIDTH;
    },
    overscan: 5,
  });

  const getItemIndex = (rowIndex: number, columnIndex: number) =>
    rowIndex * columnCount + columnIndex;

  const getItem = (rowIndex: number, columnIndex: number): FileNode | null => {
    const index = getItemIndex(rowIndex, columnIndex);
    return fileNodes[index] || null;
  };

  if (fileNodes.length === 0) {
    return (
      <div className="mb-8 text-sm text-gray-400">
        {t("folderView.sections.documents.empty")}
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
          fileNode={fileNode}
          sharingType={sharingType ?? "LOCAL"}
          isAllowedToCreateDocuments={isAllowedToCreateDocuments ?? false}
          onRenameNode={onRenameNode}
          onDuplicateNode={onDuplicateNode}
          onMoveNode={onMoveNode}
          onCopyNode={onCopyNode}
          onAddFile={onAddFile}
          onAddFolder={onAddFolder}
          onAddAndSelectNewFolder={onAddAndSelectNewFolder}
          getSyncStatusSync={getSyncStatusSync}
          setSelectedNode={setSelectedNode}
          showDeleteNodeModal={showDeleteNodeModal}
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
        overflow: "auto",
      }}
    >
      <div
        style={{
          height: `${rowVirtualizer.getTotalSize()}px`,
          width: `${columnVirtualizer.getTotalSize()}px`,
          position: "relative",
        }}
      >
        {rowVirtualizer.getVirtualItems().map((virtualRow) => (
          <React.Fragment key={virtualRow.key}>
            {columnVirtualizer.getVirtualItems().map((virtualColumn) => (
              <div
                key={virtualColumn.key}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  marginTop: virtualRow.index === 0 ? 0 : GAP,
                  width: `${virtualColumn.size}px`,
                  height: `${virtualRow.size}px`,
                  transform: `translateX(${virtualColumn.start}px) translateY(${virtualRow.start}px)`,
                }}
              >
                {renderItem(virtualRow.index, virtualColumn.index)}
              </div>
            ))}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

export default FileContentView;
