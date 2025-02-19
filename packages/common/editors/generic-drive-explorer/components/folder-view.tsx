import { BaseProps } from "@editors/utils";
import {
  FILE,
  FOLDER,
  FolderItem,
  UiDriveNode,
  UiFileNode,
  UiFolderNode,
  UiNode,
} from "@powerhousedao/design-system";
import { sortUiNodesByName } from "editors/utils/uiNodes";
import { useTranslation } from "react-i18next";
import { twMerge } from "tailwind-merge";
import FileContentView from "./file-content-view";
import { DriveLayout } from "./layout";

interface IFolderViewProps extends BaseProps {
  node: UiDriveNode | UiFolderNode;
  isDropTarget: boolean;
  onSelectNode: (uiNode: UiNode) => void;
  onRenameNode: (name: string, uiNode: UiNode) => void;
  onDuplicateNode: (uiNode: UiNode) => void;
  onDeleteNode: (uiNode: UiNode) => void;
  onAddFile: (file: File, parentNode: UiNode | null) => Promise<void>;
  onCopyNode: (uiNode: UiNode, targetNode: UiNode) => Promise<void>;
  onMoveNode: (uiNode: UiNode, targetNode: UiNode) => Promise<void>;
  isAllowedToCreateDocuments: boolean;
}

export function FolderView(props: IFolderViewProps) {
  const { node, className, isDropTarget, containerProps, ...nodeProps } = props;
  const { t } = useTranslation();

  const folderNodes = node.children
    .filter((node) => node.kind === FOLDER)
    .sort(sortUiNodesByName);

  const fileNodes: UiFileNode[] = node.children
    .filter((node) => node.kind === FILE)
    .sort(sortUiNodesByName);

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
              uiNode={folderNode}
              onAddFile={nodeProps.onAddFile}
              onCopyNode={nodeProps.onCopyNode}
              onMoveNode={nodeProps.onMoveNode}
              onSelectNode={nodeProps.onSelectNode}
              onRenameNode={nodeProps.onRenameNode}
              onDuplicateNode={nodeProps.onDuplicateNode}
              onDeleteNode={nodeProps.onDeleteNode}
              isAllowedToCreateDocuments={nodeProps.isAllowedToCreateDocuments}
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
            onSelectNode={nodeProps.onSelectNode}
            onRenameNode={nodeProps.onRenameNode}
            onDuplicateNode={nodeProps.onDuplicateNode}
            onDeleteNode={nodeProps.onDeleteNode}
            isAllowedToCreateDocuments={nodeProps.isAllowedToCreateDocuments}
          />
        </div>
      </DriveLayout.ContentSection>
    </div>
  );
}

export default FolderView;
