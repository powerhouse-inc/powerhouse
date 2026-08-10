import { Icon, PowerhouseButton } from "@powerhousedao/design-system";
import type { DocumentTypeOption } from "@powerhousedao/design-system/connect";
import { CreateDocumentWithTypeModal } from "@powerhousedao/design-system/connect";
import {
  addDocument,
  preloadEditorModule,
  setSelectedNode,
  useAllowedDocumentModelModules,
  useDisabledEditors,
  useEditorModules,
  useParentFolderForSelectedNode,
  useSelectedDriveSafe,
  useSelectedFolder,
  useStudioMode,
  useUserPermissions,
} from "@powerhousedao/reactor-browser";
import type { DocumentModelModule } from "@powerhousedao/shared/document-model";
import { useState } from "react";
import { selectCreatableModules } from "../utils/select-creatable-modules.js";

function toDocumentTypeOption(
  doc: DocumentModelModule,
  studioMode: boolean,
): DocumentTypeOption {
  const spec = doc.documentModel.global;
  return {
    documentType: spec.id,
    name: spec.name,
    // Outside studio mode only the latest version is offered, so the version
    // suffix is dropped from the label and creation resolves latest-wins.
    version: studioMode ? doc.version : undefined,
    description: spec.description,
  };
}

export function CreateDocument() {
  const [showModal, setShowModal] = useState(false);
  const { isAllowedToCreateDocuments } = useUserPermissions();
  // Respect Connect config: allowedDocumentTypes (allowlist) via the hook,
  // disabledEditors (denylist) subtracted below.
  const allowedDocumentModelModules = useAllowedDocumentModelModules();
  const editorModules = useEditorModules();
  const disabledEditors = useDisabledEditors() ?? [];
  const [selectedDrive] = useSelectedDriveSafe();
  const selectedFolder = useSelectedFolder();
  const parentFolder = useParentFolderForSelectedNode();
  // Drive containers are never documents-in-a-drive; hide them structurally so
  // this shared editor can't fail open when disabledEditors is unset.
  const DRIVE_CONTAINER_TYPES = [
    "powerhouse/document-drive",
    "powerhouse/reactor-drive",
  ];
  const studioMode = useStudioMode() ?? false;
  const visibleDocumentModelModules = selectCreatableModules(
    allowedDocumentModelModules ?? [],
    studioMode,
  ).filter((module) => {
    const id = module.documentModel.global.id;
    return !DRIVE_CONTAINER_TYPES.includes(id) && !disabledEditors.includes(id);
  });
  const preloadEditorsForType = (documentType: string) =>
    editorModules
      ?.filter((editorModule) =>
        editorModule.documentTypes.includes(documentType),
      )
      .forEach((editorModule) => {
        void preloadEditorModule(editorModule);
      });
  const handleCreate = async ({
    name,
    documentType,
    version,
  }: {
    name: string;
    documentType: string;
    version?: number;
  }) => {
    setShowModal(false);
    if (!selectedDrive) return;
    try {
      const node = await addDocument(
        selectedDrive.header.id,
        name,
        documentType,
        selectedFolder?.id ?? parentFolder?.id,
        undefined,
        undefined,
        undefined,
        version,
      );
      setSelectedNode(node);
    } catch (error) {
      console.error("Failed to create document:", error);
    }
  };
  if (!isAllowedToCreateDocuments) return null;
  if (!visibleDocumentModelModules.length) return null;
  // Rendered in the "Documents and files" heading row (see folder-view.tsx),
  // so the button is compact and brings no layout wrapper of its own.
  return (
    <>
      <PowerhouseButton
        className="py-2"
        color="blue"
        icon={<Icon name="Plus" size={14} />}
        onClick={() => setShowModal(true)}
        size="small"
      >
        Create New Document
      </PowerhouseButton>
      <CreateDocumentWithTypeModal
        documentTypes={visibleDocumentModelModules.map((module) =>
          toDocumentTypeOption(module, studioMode),
        )}
        onCreate={(input) => void handleCreate(input)}
        onOpenChange={setShowModal}
        onTypeSelected={preloadEditorsForType}
        open={showModal}
      />
    </>
  );
}
