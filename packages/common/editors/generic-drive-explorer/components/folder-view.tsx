import type { BaseProps } from "@powerhousedao/common";
import { DriveLayout, FileContentView } from "@powerhousedao/common";
import type { TNodeActions } from "@powerhousedao/design-system";
import { FolderItem, useDrop } from "@powerhousedao/design-system";
import {
  isFileNodeKind,
  isFolderNodeKind,
  useNodesInSelectedDriveOrFolder,
} from "@powerhousedao/reactor-browser";
import type { FolderNode, Node, SharingType, SyncStatus } from "document-drive";
import { useTranslation } from "react-i18next";
import { twMerge } from "tailwind-merge";

type IFolderViewProps = BaseProps &
  TNodeActions & {
    node: FolderNode | undefined;
    sharingType: SharingType;
    isAllowedToCreateDocuments: boolean;
    setSelectedNode: (id: Node | string | undefined) => void;
    showDeleteNodeModal: (node: Node) => void;
    getSyncStatusSync: (
      syncId: string,
      sharingType: SharingType,
    ) => SyncStatus | undefined;
  };

export function FolderView(props: IFolderViewProps) {
  const {
    node,
    isAllowedToCreateDocuments,
    className,
    containerProps,
    sharingType,
    getSyncStatusSync,
    setSelectedNode,
    onAddFile,
    onCopyNode,
    onMoveNode,
    onRenameNode,
    onDuplicateNode,
    onAddFolder,
    onAddAndSelectNewFolder,
    showDeleteNodeModal,
  } = props;
  const { t } = useTranslation();
  const nodes = useNodesInSelectedDriveOrFolder();
  const fileNodes = nodes.filter((n) => isFileNodeKind(n));
  const folderNodes = nodes.filter((n) => isFolderNodeKind(n));
  const { isDropTarget, dropProps } = useDrop({
    node,
    onAddFile,
    onCopyNode,
    onMoveNode,
  });
  return (
    <div
      className={twMerge(
        "rounded-md border-2 border-transparent p-2",
        isDropTarget && "border-dashed border-blue-100",
        className,
      )}
      {...containerProps}
      {...dropProps}
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
              folderNode={folderNode}
              isAllowedToCreateDocuments={isAllowedToCreateDocuments}
              sharingType={sharingType}
              getSyncStatusSync={getSyncStatusSync}
              setSelectedNode={setSelectedNode}
              onAddFile={onAddFile}
              onCopyNode={onCopyNode}
              onMoveNode={onMoveNode}
              onRenameNode={onRenameNode}
              onDuplicateNode={onDuplicateNode}
              onAddFolder={onAddFolder}
              onAddAndSelectNewFolder={onAddAndSelectNewFolder}
              showDeleteNodeModal={showDeleteNodeModal}
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
        <div className="w-full">
          <FileContentView
            fileNodes={fileNodes}
            isAllowedToCreateDocuments={isAllowedToCreateDocuments}
            sharingType={sharingType}
            getSyncStatusSync={getSyncStatusSync}
            setSelectedNode={setSelectedNode}
            showDeleteNodeModal={showDeleteNodeModal}
            onAddFile={onAddFile}
            onCopyNode={onCopyNode}
            onMoveNode={onMoveNode}
            onRenameNode={onRenameNode}
            onDuplicateNode={onDuplicateNode}
            onAddFolder={onAddFolder}
            onAddAndSelectNewFolder={onAddAndSelectNewFolder}
          />
        </div>
      </DriveLayout.ContentSection>
    </div>
  );
}

export default FolderView;
