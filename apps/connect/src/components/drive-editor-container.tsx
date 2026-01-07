import { GenericDriveExplorer } from "@powerhousedao/common/generic-drive-explorer";
import { DropZoneWrapper } from "@powerhousedao/design-system/connect";
import {
  useDefaultDriveEditorModule,
  useDriveEditorModuleById,
  useSelectedDocumentId,
  useSelectedDrive,
} from "@powerhousedao/reactor-browser";
import { Suspense } from "react";
import { DocumentEditorContainer } from "./document-editor-container.js";
import { EditorLoader } from "./editor-loader.js";
import { ErrorBoundary } from "./error-boundary.js";

export function DriveEditorContainer() {
  const [selectedDrive] = useSelectedDrive();
  const selectedDocumentId = useSelectedDocumentId();

  const driveEditor = useDriveEditorModuleById(
    selectedDrive.header.meta?.preferredEditor,
  );
  const defaultDriveEditor = useDefaultDriveEditorModule();

  const DriveEditorComponent =
    driveEditor?.Component ??
    defaultDriveEditor?.Component ??
    GenericDriveExplorer.Component;

  if (!DriveEditorComponent) {
    throw new Error("No drive editor component found");
  }
  return (
    <ErrorBoundary
      variant="detailed"
      resetKeys={[selectedDrive.header.id]}
      loggerContext={["Connect", "DriveEditor"]}
    >
      <Suspense fallback={<EditorLoader />}>
        <DropZoneWrapper className="flex h-full flex-col overflow-auto">
          <DriveEditorComponent>
            {selectedDocumentId ? <DocumentEditorContainer /> : null}
          </DriveEditorComponent>
        </DropZoneWrapper>
      </Suspense>
    </ErrorBoundary>
  );
}
