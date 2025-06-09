import { type BaseProps } from "#editors/utils/index";
import {
  useGetSyncStatusSync,
  useIsAllowedToCreateDocuments,
  useNodeFolderChildren,
  useNodeHasFileChildren,
  useSelectedDriveId,
  useSelectedNodeId,
  useSetSelectedNodeId,
} from "#state";
import {
  FolderItem,
  useDrop,
  type OnAddFile,
  type OnCopyNode,
  type OnDeleteNode,
  type OnMoveNode,
  type OnRenameNode,
  type SharingType,
} from "@powerhousedao/design-system";
import { useTranslation } from "react-i18next";
import { twMerge } from "tailwind-merge";
import FileContentView from "./file-content-view.js";
import { DriveLayout } from "./layout.js";

interface IFolderViewProps extends BaseProps {
  sharingType: SharingType;
  onRenameNode: OnRenameNode;
  onDeleteNode: OnDeleteNode;
  onAddFile: OnAddFile;
  onCopyNode: OnCopyNode;
  onMoveNode: OnMoveNode;
}

export function FolderView(props: IFolderViewProps) {
  const {
    className,
    containerProps,
    sharingType,
    onAddFile,
    onCopyNode,
    onMoveNode,
    onRenameNode,
    onDeleteNode,
  } = props;
  const { t } = useTranslation();
  const selectedNodeId = useSelectedNodeId();
  const setSelectedNodeId = useSetSelectedNodeId();
  const selectedDriveId = useSelectedDriveId();
  const { isDropTarget } = useDrop({
    nodeId: selectedNodeId,
    driveId: selectedDriveId,
    nodeKind: "FOLDER",
    onAddFile,
    onCopyNode,
    onMoveNode,
  });
  const folderNodes = useNodeFolderChildren(selectedNodeId);
  const hasFileChildren = useNodeHasFileChildren(selectedNodeId);
  const isAllowedToCreateDocuments = useIsAllowedToCreateDocuments();
  const getSyncStatusSync = useGetSyncStatusSync();

  if (!selectedNodeId || !selectedDriveId) {
    return null;
  }

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
              driveId={selectedDriveId}
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
            hasFileChildren ? "min-h-[400px]" : "min-h-14",
          )}
        >
          <FileContentView
            sharingType={sharingType}
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
