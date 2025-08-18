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
import { AnalyticsProvider } from "@powerhousedao/reactor-browser/analytics/context";
import { DriveContextProvider, useDriveContext } from "@powerhousedao/reactor-browser/hooks/useDriveContext";
import { useInitializePHApp, useSetSelectedNode } from '@powerhousedao/state';
import { type DocumentDriveDocument, type FileNode } from "document-drive";
import { WagmiContext } from "@powerhousedao/design-system";
import { DriveExplorer } from "./components/DriveExplorer.js";
import { useCallback } from "react";

export type IProps = DriveEditorProps<DocumentDriveDocument>;

/**
 * Base editor component that renders the drive explorer interface.
 * Customize document opening behavior and drive-level actions here.
 */
export function BaseEditor(props: IProps) {
  const { context, document } = props;

  // Get drive operations from context
  const {
    onAddFolder,
    onRenameNode,
    onCopyNode,
    showDeleteNodeModal,
  } = useDriveContext();

  const setSelectedNode = useSetSelectedNode();

  // Handle document opening - customize this to modify document open behavior
  const onOpenDocument = useCallback(
    (node: FileNode) => {
      setSelectedNode(node.id);
    },
    [setSelectedNode],
  );

  return (
    <div className="new-drive-explorer" style={{ height: "100%" }}>
      <DriveExplorer
        driveId={document.header.id}
        onAddFolder={onAddFolder}
        onRenameNode={onRenameNode}
        onCopyNode={onCopyNode}
        onOpenDocument={onOpenDocument}
        showDeleteNodeModal={showDeleteNodeModal}
        context={context}
      />
    </div>
  );
}

/**
 * Main editor entry point with required providers.
 * useInitializePHApp() is required for state management to work properly.
 */
export default function Editor(props: IProps) {
  // Required: Initialize Powerhouse app state
  useInitializePHApp();

  return (
    // Required context providers for drive functionality
    <DriveContextProvider value={props.context}>
      <WagmiContext>
        <AnalyticsProvider databaseName={props.context.analyticsDatabaseName}>
          <BaseEditor {...props} />
        </AnalyticsProvider>
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
