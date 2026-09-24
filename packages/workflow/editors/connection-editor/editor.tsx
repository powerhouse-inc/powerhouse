import { DocumentToolbar } from "@powerhousedao/design-system/connect";
import {
  showDeleteNodeModal,
  useSelectedDocumentId,
} from "@powerhousedao/reactor-browser";
import { useSelectedConnectionDocument } from "document-models/connection";
import { DocumentErrorBoundary } from "../shared/DocumentErrorBoundary.js";
import { useSyncWorkflowRuntimeUrl } from "../workflow-editor/use-runtime-url.js";
import { connectionCallbacks } from "./connection-callbacks.js";
import { ConnectionForm } from "./connection-form.js";
import { ConnectionToolbar } from "./ConnectionToolbar.js";

function ConnectionEditor() {
  useSyncWorkflowRuntimeUrl();
  const [document, dispatch] = useSelectedConnectionDocument();
  const state = document.state.global;

  const callbacks = connectionCallbacks(state, dispatch);

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <DocumentToolbar />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-2xl px-6 py-10">
          <ConnectionToolbar
            state={state}
            onRename={callbacks.setName}
            onSetStatus={callbacks.setStatus}
            onDelete={() => showDeleteNodeModal(document.header.id)}
          />
          <ConnectionForm state={state} callbacks={callbacks} />
        </div>
      </div>
    </div>
  );
}

// A drive node can point at a document the reactor cannot serve; the document
// hooks throw for it. The boundary keeps that failure inside the editor pane.
export default function Editor() {
  const documentId = useSelectedDocumentId();
  return (
    <DocumentErrorBoundary documentId={documentId}>
      <ConnectionEditor />
    </DocumentErrorBoundary>
  );
}
