import { DocumentToolbar } from "@powerhousedao/design-system/connect";
import { useSelectedDocumentId } from "@powerhousedao/reactor-browser";
import { generateId } from "document-model";
import {
  actions,
  useSelectedConnectionDocument,
} from "document-models/connection";
import { DocumentErrorBoundary } from "../shared/DocumentErrorBoundary.js";
import { useSyncWorkflowRuntimeUrl } from "../workflow-editor/use-runtime-url.js";
import { ConnectionForm, type ConnectionCallbacks } from "./connection-form.js";
import { connectorIdForPiece, planFromAuth } from "./piece-auth.js";

function ConnectionEditor() {
  useSyncWorkflowRuntimeUrl();
  const [document, dispatch] = useSelectedConnectionDocument();
  const state = document.state.global;

  const callbacks: ConnectionCallbacks = {
    setName: (name) => {
      dispatch(actions.setConnectionName({ name }));
      dispatch(actions.setName(name));
    },
    pickPiece: (piece) => {
      const plan = planFromAuth(piece.auth);
      dispatch(
        actions.setConnector({
          connectorId: connectorIdForPiece(piece.name),
          authType: plan.authType,
        }),
      );
    },
    setConfigValue: (name, value) => {
      const config = {
        ...((state.config ?? {}) as Record<string, unknown>),
      };
      if (value === undefined) delete config[name];
      else config[name] = value;
      dispatch(actions.setConfig({ config }));
    },
    setSecretRef: (name, ref) => {
      const existing = state.secretRefs.find((entry) => entry.name === name);
      dispatch(
        actions.setSecretRef({ id: existing?.id ?? generateId(), name, ref }),
      );
    },
    removeSecretRef: (name) => {
      const existing = state.secretRefs.find((entry) => entry.name === name);
      if (existing) dispatch(actions.removeSecretRef({ id: existing.id }));
    },
    setStatus: (status) => {
      dispatch(
        actions.recordCheckResult({
          status,
          checkedAt: new Date().toISOString(),
        }),
      );
    },
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <DocumentToolbar />
      <div className="mx-auto w-full max-w-2xl p-6">
        <ConnectionForm state={state} callbacks={callbacks} />
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
