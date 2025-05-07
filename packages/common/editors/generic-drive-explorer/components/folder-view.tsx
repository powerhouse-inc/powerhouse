import type { BaseProps } from "#editors/utils/index";
import {
  FILE,
  FOLDER,
  FolderItem,
  type BaseUiFileNode,
  type BaseUiFolderNode,
  type BaseUiNode,
  type UiDriveNode,
  type UiFileNode,
  type UiFolderNode,
  type UiNode,
} from "@powerhousedao/design-system";
import { useTranslation } from "react-i18next";
import { twMerge } from "tailwind-merge";
import { sortUiNodesByName } from "../../utils/uiNodes.js";
import FileContentView from "./file-content-view.js";
import { DriveLayout } from "./layout.js";

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

  // Remove after ts reset is fixed
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
  const folderNodes = node.children
    .filter((node) => node.kind === FOLDER)
    .sort(sortUiNodesByName) as UiFolderNode[];

  // Remove after ts reset is fixed
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
  const fileNodes: UiFileNode[] = node.children
    .filter((node) => node.kind === FILE)
    .sort(sortUiNodesByName) as UiFileNode[];

  // Convert UiNode callbacks to BaseUiFolderNode callbacks
  const folderCallbacks = {
    onSelectNode: (node: BaseUiFolderNode) =>
      nodeProps.onSelectNode(node as UiNode),
    onRenameNode: (name: string, node: BaseUiFolderNode) =>
      nodeProps.onRenameNode(name, node as UiNode),
    onDuplicateNode: (node: BaseUiFolderNode) =>
      nodeProps.onDuplicateNode(node as UiNode),
    onDeleteNode: (node: BaseUiFolderNode) =>
      nodeProps.onDeleteNode(node as UiNode),
  };

  // Convert UiNode callbacks to BaseUiFileNode callbacks
  const fileCallbacks = {
    onSelectNode: (node: BaseUiFileNode) =>
      nodeProps.onSelectNode(node as UiNode),
    onRenameNode: (name: string, node: BaseUiFileNode) =>
      nodeProps.onRenameNode(name, node as UiNode),
    onDuplicateNode: (node: BaseUiFileNode) =>
      nodeProps.onDuplicateNode(node as UiNode),
    onDeleteNode: (node: BaseUiFileNode) =>
      nodeProps.onDeleteNode(node as UiNode),
  };

  // Convert UiNode callbacks to BaseUiNode callbacks
  const baseNodeCallbacks = {
    onAddFile: async (file: File, parentNode: BaseUiNode | null) => {
      await nodeProps.onAddFile(file, parentNode as UiNode | null);
    },
    onCopyNode: async (uiNode: BaseUiNode, targetNode: BaseUiNode) => {
      await nodeProps.onCopyNode(uiNode as UiNode, targetNode as UiNode);
    },
    onMoveNode: async (uiNode: BaseUiNode, targetNode: BaseUiNode) => {
      await nodeProps.onMoveNode(uiNode as UiNode, targetNode as UiNode);
    },
  };

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
              {...baseNodeCallbacks}
              {...folderCallbacks}
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
            {...fileCallbacks}
            isAllowedToCreateDocuments={nodeProps.isAllowedToCreateDocuments}
          />
        </div>
      </DriveLayout.ContentSection>
    </div>
  );
}

export default FolderView;
