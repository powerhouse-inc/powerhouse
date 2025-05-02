export const EXPECTED_INDEX_CONTENT = `import { type DriveEditorModule } from "@powerhousedao/reactor-browser";
import { type DocumentDriveDocument } from "document-drive";
import Editor from "./editor.js";

export const module: DriveEditorModule<DocumentDriveDocument> = {
  Component: Editor,
  documentTypes: ["powerhouse/document-drive"],
  config: {
    id: "AtlasDriveExplorer",
    disableExternalControls: true,
    documentToolbarEnabled: true,
    showSwitchboardLink: true,
  },
};

export default module;`;

export const EXPECTED_EDITOR_CONTENT = `import { type DriveEditorProps } from "@powerhousedao/reactor-browser";
import { AnalyticsProvider } from '@powerhousedao/reactor-browser/analytics/context';
import { DriveContextProvider } from "@powerhousedao/reactor-browser/hooks/useDriveContext";
import { type DocumentDriveDocument, addFolder, deleteNode, updateNode, generateNodesCopy, copyNode } from "document-drive";
import { WagmiContext } from "@powerhousedao/design-system";
import { DriveExplorer } from "./components/DriveExplorer.js";
import { useCallback } from "react";
import { generateId } from "document-model";

export type IProps = DriveEditorProps<DocumentDriveDocument>;

export function BaseEditor(props: IProps) {
  const { dispatch, context } = props;
  
  const onAddFolder = useCallback((name: string, parentFolder?: string) => {
    dispatch(addFolder({
      id: generateId(),
      name,
      parentFolder,
    }));
  }, [dispatch]);

  const onDeleteNode = useCallback((nodeId: string) => {
    dispatch(deleteNode({ id: nodeId }));
  }, [dispatch]);

  const renameNode = useCallback((nodeId: string, name: string) => {
    dispatch(updateNode({ id: nodeId, name }));
  }, [dispatch]);

  const onCopyNode = useCallback((nodeId: string, targetName: string, parentId?: string) => {
    const copyNodesInput = generateNodesCopy({
      srcId: nodeId,
      targetParentFolder: parentId,
      targetName,
    }, () => generateId(), props.document.state.global.nodes);

    const copyNodesAction = copyNodesInput.map(input => {
      return copyNode(input);
    });

    for (const copyNodeAction of copyNodesAction) {
      dispatch(copyNodeAction);
    }
  }, [dispatch, props.document.state.global.nodes]);

  return (
    <div
      className="new-drive-explorer"
      style={{ height: "100%" }}
    >
      <DriveExplorer
        driveId={props.document.state.global.id}
        nodes={props.document.state.global.nodes}
        onAddFolder={onAddFolder}
        onDeleteNode={onDeleteNode}
        renameNode={renameNode}
        onCopyNode={onCopyNode}
        context={context}
      />
    </div>
  );
}

export default function Editor(props: IProps) {
  const baseEditor = props.context.analyticsStore ? (
    <AnalyticsProvider store={props.context.analyticsStore}>
      <BaseEditor {...props} />
    </AnalyticsProvider>
  ) : (
    <BaseEditor {...props} />
  );

  return (
    <DriveContextProvider value={props.context}>
      <WagmiContext>
        {baseEditor}
      </WagmiContext>
    </DriveContextProvider>
  );
}`;

export const EXPECTED_MAIN_INDEX_CONTENT = `/**
* This is a scaffold file meant for customization.
* Delete the file and run the code generator again to have it reset
*/

export { module as AtlasDriveExplorer } from './atlas-drive-explorer/index.js';`;

export const EXPECTED_HEADER_COMMENT = `/**
* This is a scaffold file meant for customization.
* Delete the file and run the code generator again to have it reset
*/`;

export const EXPECTED_EXISTING_EDITOR_EXPORT = `export { module as ExistingEditor } from './existing-editor/index.js'`;

export const EXPECTED_DRIVE_EXPLORER_EXPORT = `export { module as AtlasDriveExplorer } from './atlas-drive-explorer/index.js'`;
