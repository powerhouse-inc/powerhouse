---
to: "<%= rootDir %>/<%= h.changeCase.param(name) %>/editor.tsx"
unless_exists: true
---
import { type DriveEditorProps } from "@powerhousedao/reactor-browser";
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
}
