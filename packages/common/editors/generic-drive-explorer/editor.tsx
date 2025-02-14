import {
  BreadcrumbNode,
  Breadcrumbs,
  FILE,
  UiNode,
  useDrop,
  useUiNodesContext,
} from "@powerhousedao/design-system";
import { EditorProps } from "document-model/document";
import {
  actions,
  DocumentDriveAction,
  DocumentDriveLocalState,
  DocumentDriveState,
} from "document-models/document-drive";
import { useDriveActions } from "editors/hooks/useDriveActions";
import { useDriveSettings } from "editors/hooks/useDriveSettings";
import { useCallback, useMemo } from "react";
import { CreateDocument } from "./components/create-document";
import FolderView from "./components/folder-view";
import { DriveLayout } from "./components/layout";
import { SearchBar } from "./components/search-bar";

export type IProps = EditorProps<
  DocumentDriveState,
  DocumentDriveAction,
  DocumentDriveLocalState
>;

export function useDriveExplorer(dispatch: IProps["dispatch"]) {
  return useMemo(
    () => ({
      onAddFile: (file: AddFileInput) => {
        dispatch(actions.addFile(file));
      },
    }),
    [dispatch],
  );
}

export default function Editor(props: IProps) {
  const { document, dispatch } = props;
  const {
    state: {
      global: { id },
    },
  } = document;
  const { showSearchBar, isAllowedToCreateDocuments, documentModels } =
    useDriveSettings();
  const {
    driveNodes,
    selectedNode,
    selectedNodePath,
    selectedDriveNode,
    selectedParentNode,
    getNodeById,
    getParentNode,
    setDriveNodes,
    setSelectedNode,
    getIsSelected,
    getIsInSelectedNodePath,
    getSiblings,
  } = useUiNodesContext();

  const driveNode = useMemo(
    () => driveNodes.find((n) => n.id === id),
    [driveNodes, id],
  );

  const { onAddFolder, renameNode, deleteNode, moveNode } = useDriveActions(
    dispatch,
    selectedNode,
  );

  const { isDropTarget, dropProps } = useDrop({
    uiNode: selectedNode,
  });

  /**
   * TODO:
   * - Breadcrumbs
   *   - selectedNodePath
   *   - onBreadcrumbSelected (change selected node)
   *   - createEnabled (isAllowedToCreateDocuments)
   *   - onCreate (add new folder)
   * - SearchBar
   *  - ?????
   *
   */

  if (!driveNode) {
    return <div>Drive not found</div>;
  } else if (selectedNode?.kind === FILE) {
    return null;
  }

  const breadcrumbs = useMemo(
    () =>
      selectedNodePath.map((node) => ({
        id: node.id,
        name: node.name,
      })),
    [selectedNodePath],
  );
  const onBreadcrumbSelected = useCallback(
    (node: BreadcrumbNode) => setSelectedNode(getNodeById(node.id)),
    [getNodeById, setSelectedNode],
  );

  const onRenameNode = useCallback(
    (name: string, node: UiNode) => renameNode(node.id, name),
    [renameNode],
  );
  const onDeleteNode = useCallback(
    (node: UiNode) => deleteNode(node.id),
    [deleteNode],
  );

  return (
    <DriveLayout>
      <DriveLayout.Header>
        <Breadcrumbs
          breadcrumbs={breadcrumbs}
          createEnabled={isAllowedToCreateDocuments}
          onCreate={onAddFolder}
          onBreadcrumbSelected={onBreadcrumbSelected}
        />
        {showSearchBar && <SearchBar />}
      </DriveLayout.Header>
      <DriveLayout.Content>
        <FolderView
          node={selectedNode || driveNode}
          onSelectNode={setSelectedNode}
          onRenameNode={onRenameNode}
          onDuplicateNode={() => {}}
          onDeleteNode={onDeleteNode}
          onAddFile={}
          onCopyNode={}
          onMoveNode={}
          isDropTarget={isDropTarget}
          isAllowedToCreateDocuments={isAllowedToCreateDocuments}
        />
      </DriveLayout.Content>
      <DriveLayout.Footer>
        {isAllowedToCreateDocuments && (
          <CreateDocument
            documentModels={documentModels}
            createDocument={() => {}}
            getDocumentModelName={() => ""}
          />
        )}
      </DriveLayout.Footer>
    </DriveLayout>
  );
}
