import { DropZoneWrapper } from "@powerhousedao/design-system/connect";
import { GenericDriveExplorer } from "@powerhousedao/powerhouse-vetra-packages/editors";
import {
    useAppModuleById,
    useDefaultAppModule,
    useSelectedDocumentId,
    useSelectedDrive,
} from "@powerhousedao/reactor-browser";
import { Suspense } from "react";
import { DocumentEditorContainer } from "./document-editor-container.js";
import { EditorLoader } from "./editor-loader.js";
import { ErrorBoundary } from "./error-boundary.js";

export function AppContainer() {
  const [selectedDrive] = useSelectedDrive();
  const selectedDocumentId = useSelectedDocumentId();

  const app = useAppModuleById(
    selectedDrive.header.meta?.preferredEditor,
  );
  const defaultApp = useDefaultAppModule();

  const AppComponent =
    app?.Component ??
    defaultApp?.Component ??
    GenericDriveExplorer.Component;

  if (!AppComponent) {
    throw new Error("No drive editor component found");
  }
  return (
    <ErrorBoundary
      variant="detailed"
      resetKeys={[selectedDrive.header.id]}
      loggerContext={["Connect", "App"]}
    >
      <Suspense fallback={<EditorLoader />}>
        <DropZoneWrapper className="flex h-full flex-col overflow-auto">
          <AppComponent>
            {selectedDocumentId ? <DocumentEditorContainer /> : null}
          </AppComponent>
        </DropZoneWrapper>
      </Suspense>
    </ErrorBoundary>
  );
}
