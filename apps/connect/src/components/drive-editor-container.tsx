// import { GenericDriveExplorer } from "@powerhousedao/common";
import { DropZoneWrapper } from "@powerhousedao/design-system";
import {
  useDefaultDriveEditorModule,
  useDriveEditorModuleById,
  useSelectedDocument,
  useSelectedDrive,
} from "@powerhousedao/reactor-browser";
import type { FallbackProps } from "react-error-boundary";
import { ErrorBoundary } from "react-error-boundary";
import { DocumentEditorContainer } from "./document-editor-container.js";

function DriveEditorError({ error }: FallbackProps) {
  return (
    <div className="mx-auto flex max-w-[80%] flex-1 flex-col items-center justify-center">
      <h1 className="mb-2 text-xl font-semibold">Error</h1>
      <i>{error instanceof Error ? error.message : error}</i>
      <pre>{JSON.stringify(error, null, 2)}</pre>
    </div>
  );
}

export function DriveEditorContainer() {
  const [selectedDrive] = useSelectedDrive();
  const [selectedDocument] = useSelectedDocument();

  const driveEditor = useDriveEditorModuleById(
    selectedDrive?.header.meta?.preferredEditor,
  );
  const defaultDriveEditor = useDefaultDriveEditorModule();

  const DriveEditorComponent =
    driveEditor?.Component ?? defaultDriveEditor?.Component;
  // ?? GenericDriveExplorer.Component;

  if (!DriveEditorComponent) {
    throw new Error("No drive editor component found");
  }
  return (
    <ErrorBoundary
      fallbackRender={DriveEditorError}
      key={selectedDrive.header.id}
    >
      <DropZoneWrapper className="flex h-full flex-col overflow-auto">
        <DriveEditorComponent>
          {selectedDocument ? <DocumentEditorContainer /> : null}
        </DriveEditorComponent>
      </DropZoneWrapper>
    </ErrorBoundary>
  );
}
