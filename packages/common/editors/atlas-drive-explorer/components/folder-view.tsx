import { BaseProps } from "@editors/utils";
import {
  FILE,
  UiDriveNode,
  UiFileNode,
  UiFolderNode,
  UiNode,
} from "@powerhousedao/design-system";
import { sortUiNodesByName } from "editors/utils/uiNodes";
import FileContentView from "./file-content-view";

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
  const { node, ...nodeProps } = props;

  // Remove after ts reset is fixed
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
  const fileNodes: UiFileNode[] = node.children
    .filter((node) => node.kind === FILE)
    .sort(sortUiNodesByName) as UiFileNode[];

  return (
    <FileContentView
      fileNodes={fileNodes}
      onSelectNode={nodeProps.onSelectNode}
      onRenameNode={nodeProps.onRenameNode}
      onDuplicateNode={nodeProps.onDuplicateNode}
      onDeleteNode={nodeProps.onDeleteNode}
      isAllowedToCreateDocuments={nodeProps.isAllowedToCreateDocuments}
    />
  );
}

export default FolderView;
