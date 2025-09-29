import { useNodeActions, useShowDeleteNodeModal } from "#hooks";
import { GenericDriveExplorer } from "@powerhousedao/common";
import type { DriveEditorProps } from "@powerhousedao/reactor-browser";
import {
  useDefaultDriveEditorModule,
  useDriveEditorModuleById,
  useSelectedDrive,
} from "@powerhousedao/reactor-browser";
import type { DocumentModelModule } from "document-model";
import type { FC } from "react";
import { useCallback } from "react";
import type { FallbackProps } from "react-error-boundary";
import { ErrorBoundary } from "react-error-boundary";
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
  const [selectedDrive, dispatch] = useSelectedDrive();
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

  const DriveEditorComponent = (driveEditor?.Component ??
    defaultDriveEditor?.Component ??
    GenericDriveExplorer.Component) as FC<DriveEditorProps>;

  const editorConfig = driveEditor?.Component
    ? driveEditor.config
    : defaultDriveEditor?.Component
      ? defaultDriveEditor.config
      : GenericDriveExplorer.config;

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
        documentId={selectedDrive.header.id}
        editorConfig={editorConfig}
      />
    </ErrorBoundary>
  );
}
