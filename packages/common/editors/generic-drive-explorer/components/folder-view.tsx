import type { BaseProps } from "#editors/utils/index";
import {
  FolderItem,
  useDrop,
  type TNodeActions,
} from "@powerhousedao/design-system";
import {
  useFileChildNodesForId,
  useFolderChildNodesForId,
} from "@powerhousedao/reactor-browser";
import {
  type FolderNode,
  type Node,
  type SharingType,
  type SyncStatus,
} from "document-drive";
import { useTranslation } from "react-i18next";
import { twMerge } from "tailwind-merge";
import FileContentView from "./file-content-view.js";
import { DriveLayout } from "./layout.js";

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
  const folderNodes = useFolderChildNodesForId(node?.id);
  const fileNodes = useFileChildNodesForId(node?.id);
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
        <div
          className={twMerge(
            "w-full",
            fileNodes.length > 0 ? "min-h-[400px]" : "min-h-14",
          )}
        >
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
