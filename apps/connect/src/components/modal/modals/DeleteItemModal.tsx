import { ConnectDeleteItemModal, toast } from "@powerhousedao/design-system";
import {
  closePHModal,
  deleteNode,
  setSelectedNode,
  useNodeKind,
  useNodeName,
  usePHModal,
  useSelectedDriveId,
  useSelectedParentFolder,
} from "@powerhousedao/reactor-browser";
import type React from "react";
import { useTranslation } from "react-i18next";

export const DeleteItemModal: React.FC = () => {
  const phModal = usePHModal();
  const open = phModal?.type === "deleteItem";
  const id = open ? phModal.id : undefined;
  const { t } = useTranslation();
  const name = useNodeName(id);
  const kind = useNodeKind(id);
  const selectedDriveId = useSelectedDriveId();
  const selectedParentFolder = useSelectedParentFolder();
  async function onDelete() {
    if (!selectedDriveId || !id) {
      return;
    }
    closePHModal();

    const i18nKey =
      kind === "FOLDER"
        ? "notifications.deleteFolderSuccess"
        : "notifications.fileDeleteSuccess";

    await deleteNode(selectedDriveId, id);

    setSelectedNode(selectedParentFolder);

    toast(t(i18nKey), { type: "connect-deleted" });
  }

  return (
    <ConnectDeleteItemModal
      open={open}
      onDelete={() => onDelete()}
      onCancel={() => closePHModal()}
      header={t(`modals.deleteItem.${kind?.toLowerCase()}.header`, {
        item: name,
      })}
      body={t(`modals.deleteItem.${kind?.toLowerCase()}.body`)}
      cancelLabel={t("common.cancel")}
      deleteLabel={t("common.delete")}
    />
  );
};
