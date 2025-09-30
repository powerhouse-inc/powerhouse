import { validateDocument } from "#utils";
import { ConnectConfirmationModal } from "@powerhousedao/design-system";
import {
  closePHModal,
  exportFile,
  useDocumentById,
  usePHModal,
} from "@powerhousedao/reactor-browser";
import { useTranslation } from "react-i18next";
export function ExportDocumentWithErrorsModal() {
  const phModal = usePHModal();
  const open = phModal?.type === "exportDocumentWithErrors";
  const documentId = open ? phModal.documentId : undefined;
  const [document] = useDocumentById(documentId);
  const { t } = useTranslation();

  if (!document) {
    return null;
  }

  const validationErrors = validateDocument(document);
  return (
    <ConnectConfirmationModal
      header={t("modals.exportDocumentWithErrors.title")}
      title={t("modals.exportDocumentWithErrors.title")}
      body={
        <div>
          <p>{t("modals.exportDocumentWithErrors.body")}</p>
          <ul className="mt-4 flex list-disc flex-col items-start px-4 text-xs">
            {validationErrors.map((error, index) => (
              <li key={index}>{error.message}</li>
            ))}
          </ul>
        </div>
      }
      cancelLabel={t("common.cancel")}
      continueLabel={t("common.export")}
      onCancel={() => closePHModal()}
      onContinue={async () => {
        try {
          await exportFile(document);
        } catch (error) {
          console.error(error);
        } finally {
          closePHModal();
        }
      }}
      open={open}
      onOpenChange={(status: boolean) => {
        if (!status) return closePHModal();
      }}
    />
  );
}
