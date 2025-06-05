import type { BaseProps } from "#editors/utils/index";
import {
  FolderItem,
  useDrop,
  type SharingType,
} from "@powerhousedao/design-system";
import { useTranslation } from "react-i18next";
import { twMerge } from "tailwind-merge";
import { useNodeFileChildren, useNodeFolderChildren } from "../atoms.js";
import {
  type GetSyncStatusSync,
  type OnAddFile,
  type OnCopyNode,
  type OnDeleteNode,
  type OnMoveNode,
  type OnRenameNode,
  type SetSelectedNodeId,
} from "../types.js";
import FileContentView from "./file-content-view.js";
import { DriveLayout } from "./layout.js";

interface IFolderViewProps extends BaseProps {
  nodeId: string;
  driveId: string;
  sharingType: SharingType;
  isAllowedToCreateDocuments: boolean;
  setSelectedNodeId: SetSelectedNodeId;
  getSyncStatusSync: GetSyncStatusSync;
  onRenameNode: OnRenameNode;
  onDeleteNode: OnDeleteNode;
  onAddFile: OnAddFile;
  onCopyNode: OnCopyNode;
  onMoveNode: OnMoveNode;
}

export function FolderView(props: IFolderViewProps) {
  const {
    nodeId,
    className,
    isAllowedToCreateDocuments,
    containerProps,
    sharingType,
    driveId,
    setSelectedNodeId,
    getSyncStatusSync,
    onAddFile,
    onCopyNode,
    onMoveNode,
    onRenameNode,
    onDeleteNode,
  } = props;
  const { t } = useTranslation();
  const { isDropTarget } = useDrop({
    nodeId,
    driveId,
    nodeKind: "FOLDER",
    onAddFile,
    onCopyNode,
    onMoveNode,
  });
  const folderNodes = useNodeFolderChildren(nodeId);
  const fileNodes = useNodeFileChildren(nodeId);
  return (
    <div
      className={twMerge(
        "rounded-md border-2 border-transparent p-2",
        isDropTarget && "border-dashed border-blue-100",
        className,
      )}
      {...containerProps}
    >
      <DriveLayout.ContentSection
        title={t("folderView.sections.folders.title", {
          defaultValue: "Folders",
        })}
        className="mb-4"
      >
        {folderNodes.length > 0 ? (
          folderNodes.map((folderNode) => (
            <FolderItem
              key={folderNode.id}
              node={folderNode}
              isAllowedToCreateDocuments={isAllowedToCreateDocuments}
              sharingType={sharingType}
              driveId={driveId}
              setSelectedNodeId={setSelectedNodeId}
              getSyncStatusSync={getSyncStatusSync}
              onAddFile={onAddFile}
              onMoveNode={onMoveNode}
              onCopyNode={onCopyNode}
              onRenameNode={onRenameNode}
              onDeleteNode={onDeleteNode}
            />
          ))
        ) : (
          <div className="mb-8 text-sm text-gray-400">
            {t("folderView.sections.folders.empty", {
              defaultValue: "No documents or files 📄",
            })}
          </div>
        )}
      </DriveLayout.ContentSection>
      <DriveLayout.ContentSection
        title={t("folderView.sections.documents.title", {
          defaultValue: "Documents and files",
        })}
      >
        <div
          className={twMerge(
            "w-full",
            fileNodes.length > 0 ? "min-h-[400px]" : "min-h-14",
          )}
        >
          <FileContentView
            fileNodes={fileNodes}
            driveId={driveId}
            isAllowedToCreateDocuments={isAllowedToCreateDocuments}
            sharingType={sharingType}
            setSelectedNodeId={setSelectedNodeId}
            getSyncStatusSync={getSyncStatusSync}
            onAddFile={onAddFile}
            onMoveNode={onMoveNode}
            onCopyNode={onCopyNode}
            onRenameNode={onRenameNode}
            onDeleteNode={onDeleteNode}
          />
        </div>
      </DriveLayout.ContentSection>
    </div>
  );
}

export default FolderView;
