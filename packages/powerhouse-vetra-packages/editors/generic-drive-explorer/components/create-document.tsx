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
  useUserPermissions,
} from "@powerhousedao/reactor-browser";
import type { DocumentModelModule } from "@powerhousedao/shared/document-model";
import { useState } from "react";

function toDocumentTypeOption(doc: DocumentModelModule): DocumentTypeOption {
  const spec = doc.documentModel.global;
  return {
    documentType: spec.id,
    name: spec.name,
    version: doc.version,
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
  const visibleDocumentModelModules = allowedDocumentModelModules?.filter(
    (module) => {
      const id = module.documentModel.global.id;
      return (
        !DRIVE_CONTAINER_TYPES.includes(id) && !disabledEditors.includes(id)
      );
    },
  );
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
  }: {
    name: string;
    documentType: string;
    version?: number;
  }) => {
    // version is display-only for now: addDocument has no version parameter,
    // the reactor resolves the latest module for the type (spec section 5).
    setShowModal(false);
    if (!selectedDrive) return;
    try {
      const node = await addDocument(
        selectedDrive.header.id,
        name,
        documentType,
        selectedFolder?.id ?? parentFolder?.id,
      );
      setSelectedNode(node);
    } catch (error) {
      console.error("Failed to create document:", error);
    }
  };
  if (!isAllowedToCreateDocuments) return null;
  if (!visibleDocumentModelModules?.length) return null;
  return (
    <div className="px-6 py-4">
      <PowerhouseButton
        color="blue"
        icon={<Icon name="Plus" size={16} />}
        onClick={() => setShowModal(true)}
      >
        Create New Document
      </PowerhouseButton>
      <CreateDocumentWithTypeModal
        documentTypes={visibleDocumentModelModules.map(toDocumentTypeOption)}
        onCreate={(input) => void handleCreate(input)}
        onOpenChange={setShowModal}
        onTypeSelected={preloadEditorsForType}
        open={showModal}
      />
    </div>
  );
}
