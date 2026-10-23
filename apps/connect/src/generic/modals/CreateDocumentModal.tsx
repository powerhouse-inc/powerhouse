import { CreateDocumentModal as ConnectCreateDocumentModal } from "@powerhousedao/design-system/connect";
import {
  addDocument,
  closePHModal,
  getDriveName,
  getNodeTarget,
  openTarget,
  showPHModal,
  useDocumentModelModuleById,
  useNodeParentFolderById,
  usePHModal,
} from "@powerhousedao/reactor-browser";
import {
  useCreateDocumentTarget,
  useDriveRouteData,
} from "@powerhousedao/connect-core/router";

export const CreateDocumentModal: React.FC = () => {
  const phModal = usePHModal();
  const open = phModal?.type === "createDocument";
  const documentType = open ? phModal.documentType : undefined;
  const documentModelVersion = open ? phModal.documentModelVersion : undefined;
  const documentModel = useDocumentModelModuleById(
    documentType,
    documentModelVersion,
  );
  // The modal's drive, else the open one, else one picked in the modal.
  const target = useCreateDocumentTarget(open ? phModal.driveId : undefined);
  // In the open folder, else beside the open document.
  const { folder, documentId } = useDriveRouteData();
  const parentFolder = useNodeParentFolderById(documentId);

  const onCreateDocument = async (documentName: string) => {
    const { drive } = target;
    if (!drive || !documentModel) return;
    closePHModal();

    const node = await addDocument(
      drive.header.id,
      documentName || `New ${documentModel.documentModel.global.name}`,
      documentModel.documentModel.global.id,
      target.isOpenDrive ? (folder?.id ?? parentFolder?.id) : undefined,
      undefined,
      undefined,
      undefined,
      documentModelVersion,
    );
    // Opens it in its drive, wherever the modal was opened.
    openTarget(getNodeTarget(node, drive));
  };

  return (
    <ConnectCreateDocumentModal
      open={open}
      drives={target.choices?.map((drive) => ({
        id: drive.header.id,
        name: getDriveName(drive),
      }))}
      driveId={target.drive?.header.id}
      onDriveChange={target.pick}
      onAddDrive={() => showPHModal({ type: "addDrive" })}
      onContinue={(documentName) => {
        void onCreateDocument(documentName);
      }}
      onOpenChange={(status: boolean) => {
        if (!status) return closePHModal();
      }}
    />
  );
};
