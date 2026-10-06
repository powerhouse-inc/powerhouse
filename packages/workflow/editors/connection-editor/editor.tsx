import {
  showDeleteNodeModal,
  useSelectedDocumentId,
} from "@powerhousedao/reactor-browser";
import {
  isReactorConnectorId,
  useSelectedConnectionDocument,
} from "document-models/connection";
import { useMemo } from "react";
import { DocumentErrorBoundary } from "../shared/DocumentErrorBoundary.js";
import { BackButton, UndoRedo } from "../shared/editor-chrome.js";
import {
  useRuntime,
  WorkflowRuntimeProvider,
} from "../workflow-editor/runtime-context.js";
import { DesignTimeProvider } from "../workflow-editor/ui/design-time.js";
import type { DesignTimeService } from "../workflow-editor/ui/forms.js";
import { connectionCallbacks } from "./connection-callbacks.js";
import { ConnectionForm } from "./connection-form.js";
import { enabledDependents } from "./connection-usage.js";
import { ConnectionToolbar } from "./ConnectionToolbar.js";
import { ReactorBindings } from "./ReactorBindings.js";
import { UsedBy, useConnectionUsage } from "./UsedBy.js";

function ConnectionEditor() {
  const [document, dispatch] = useSelectedConnectionDocument();
  const state = document.state.global;
  const { client, queryClient } = useRuntime();
  // Block forms, for what each step that binds a reactor connection declares.
  const designTime = useMemo<DesignTimeService>(
    () => ({
      getBlockForm: (block) => client.getBlockForm(block),
      loadOptions: (...args) => client.loadBlockOptions(...args),
    }),
    [client],
  );

  const callbacks = connectionCallbacks(state, dispatch);
  const usage = useConnectionUsage(document.header.id);
  const reactor = isReactorConnectorId(state.connectorId);

  return (
    <DesignTimeProvider
      service={designTime}
      queryClient={queryClient}
      scope={client.url}
    >
      <div className="flex h-full min-h-0 flex-col bg-background">
        <div className="flex items-center justify-between border-b border-solid border-foreground/10 px-4 py-2">
          <BackButton />
          <UndoRedo documentId={document.header.id} />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-2xl px-6 py-10">
            <ConnectionToolbar
              connectionId={document.header.id}
              enabledDependents={enabledDependents(usage)}
              state={state}
              onRename={callbacks.setName}
              onSetStatus={callbacks.setStatus}
              onDelete={() => showDeleteNodeModal(document.header.id)}
            />
            <ConnectionForm
              state={state}
              callbacks={callbacks}
              connectionId={document.header.id}
            />
            {reactor ? (
              <ReactorBindings config={state.config} usage={usage} />
            ) : null}
            <UsedBy usage={usage} />
          </div>
        </div>
      </div>
    </DesignTimeProvider>
  );
}

// A drive node can point at a document the reactor cannot serve; the document
// hooks throw for it. The boundary keeps that failure inside the editor pane.
export default function Editor() {
  const documentId = useSelectedDocumentId();
  return (
    <DocumentErrorBoundary documentId={documentId}>
      <WorkflowRuntimeProvider>
        <ConnectionEditor />
      </WorkflowRuntimeProvider>
    </DocumentErrorBoundary>
  );
}
