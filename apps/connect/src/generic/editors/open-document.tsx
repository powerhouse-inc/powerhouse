import {
  RouteSelection,
  useDriveRouteData,
} from "@powerhousedao/connect-core/router";
import { lazy, Suspense } from "react";
import { EditorLoader } from "./editor-loader.js";
import { ErrorBoundary } from "@powerhousedao/connect/components/shared";

const DocumentEditorContainer = lazy(() =>
  import("./document-editor-container.js").then((module) => ({
    default: module.DocumentEditorContainer,
  })),
);

/** The route's open document's editor, e.g. in a project's drive route
 * override; nothing while no document is open. */
export function OpenDocument() {
  const { documentId } = useDriveRouteData();
  if (!documentId) return null;
  return (
    <ErrorBoundary
      variant="detailed"
      resetKeys={[documentId]}
      loggerContext={["Connect", "OpenDocument"]}
    >
      <Suspense fallback={<EditorLoader />}>
        <RouteSelection>
          <DocumentEditorContainer documentId={documentId} />
        </RouteSelection>
      </Suspense>
    </ErrorBoundary>
  );
}
