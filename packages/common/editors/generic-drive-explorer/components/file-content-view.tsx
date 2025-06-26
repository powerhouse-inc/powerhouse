import {
  FileItem,
  type OnAddFile,
  type OnCopyNode,
  type OnDeleteNode,
  type OnMoveNode,
  type OnRenameNode,
  type SharingType,
  useWindowSize,
} from "@powerhousedao/design-system";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { FileNode } from "document-drive";
import React, { useRef } from "react";
import { useTranslation } from "react-i18next";
import { useSelectedDrive } from "../../../state/drives.js";
import {
  isFileNodeKind,
  useChildNodes,
  useSetSelectedNode,
} from "../../../state/nodes.js";
import { useIsAllowedToCreateDocuments } from "../../../state/permissions.js";
import { useGetSyncStatusSync } from "../../../state/reactor.js";

type Props = {
  sharingType: SharingType;
  onRenameNode: OnRenameNode;
  onDeleteNode: OnDeleteNode;
  onAddFile: OnAddFile;
  onCopyNode: OnCopyNode;
  onMoveNode: OnMoveNode;
};

const GAP = 8;
const ITEM_WIDTH = 256;
const ITEM_HEIGHT = 48;

const USED_SPACE = 420;

export function FileContentView(props: Props) {
  const parentRef = useRef(null);
  const { t } = useTranslation();
  const windowSize = useWindowSize();
  const {
    sharingType,
    onRenameNode,
    onDeleteNode,
    onAddFile,
    onCopyNode,
    onMoveNode,
  } = props;
  const selectedDrive = useSelectedDrive();
  const setSelectedNode = useSetSelectedNode();
  const loadableChildNodes = useChildNodes();
  const fileNodeCount =
    loadableChildNodes.state === "hasData"
      ? (loadableChildNodes.data?.filter(isFileNodeKind).length ?? 0)
      : 0;
  const isAllowedToCreateDocuments = useIsAllowedToCreateDocuments();
  const getSyncStatusSync = useGetSyncStatusSync();
  const availableWidth = windowSize.innerWidth - USED_SPACE;

  const columnCount = Math.floor(availableWidth / (ITEM_WIDTH + GAP)) || 1;
  const rowCount = Math.ceil(fileNodeCount / columnCount);

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

  if (loadableChildNodes.state !== "hasData") {
    return null;
  }

  const fileNodes = loadableChildNodes.data?.filter(isFileNodeKind) ?? [];

  const getItemIndex = (rowIndex: number, columnIndex: number) =>
    rowIndex * columnCount + columnIndex;

  const getItem = (rowIndex: number, columnIndex: number): FileNode | null => {
    const index = getItemIndex(rowIndex, columnIndex);
    return fileNodes[index] || null;
  };

  if (fileNodeCount === 0) {
    return (
      <div className="mb-8 text-sm text-gray-400">
        {t("folderView.sections.documents.empty", {
          defaultValue: "No documents or files 📄",
        })}
      </div>
    );
  }

  const renderItem = (rowIndex: number, columnIndex: number) => {
    const fileNode = getItem(rowIndex, columnIndex);

    if (
      !fileNode ||
      selectedDrive.state !== "hasData" ||
      !selectedDrive.data?.id
    ) {
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
          node={fileNode}
          sharingType={sharingType}
          isAllowedToCreateDocuments={isAllowedToCreateDocuments}
          driveId={selectedDrive.data.id}
          onCopyNode={onCopyNode}
          onMoveNode={onMoveNode}
          getSyncStatusSync={getSyncStatusSync}
          setSelectedDocument={(nodeId) => setSelectedNode(nodeId ?? undefined)}
          onRenameNode={onRenameNode}
          onDeleteNode={onDeleteNode}
          onAddFile={onAddFile}
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
