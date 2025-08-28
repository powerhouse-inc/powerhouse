import { GenericDriveExplorer } from "@powerhousedao/common";
import { useNodeActions, useShowDeleteNodeModal } from "@powerhousedao/connect";
import {
  useDefaultDriveEditorModule,
  useDriveEditorModuleById,
  useSelectedDrive,
} from "@powerhousedao/reactor-browser";
import { type DocumentModelModule } from "document-model";
import { useCallback } from "react";
import { ErrorBoundary, type FallbackProps } from "react-error-boundary";
import { useModal } from "./modal/index.js";

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
  const nodeActions = useNodeActions();
  const { showModal } = useModal();
  const showCreateDocumentModal = useCallback(
    (documentModel: DocumentModelModule) => {
      showModal("createDocument", {
        documentModel,
      });
    },
    [showModal],
  );
  const showDeleteNodeModal = useShowDeleteNodeModal();

  const driveEditor = useDriveEditorModuleById(
    selectedDrive?.header.meta?.preferredEditor,
  );
  const defaultDriveEditor = useDefaultDriveEditorModule();

  const DriveEditorComponent =
    driveEditor?.Component ??
    defaultDriveEditor?.Component ??
    GenericDriveExplorer.Component;

  if (!selectedDrive) return null;

  return (
    <ErrorBoundary
      fallbackRender={DriveEditorError}
      key={selectedDrive.header.id}
    >
      <DriveEditorComponent
        context={{
          ...nodeActions,
          showCreateDocumentModal,
          showDeleteNodeModal,
        }}
        document={selectedDrive}
      />
    </ErrorBoundary>
  );
}
