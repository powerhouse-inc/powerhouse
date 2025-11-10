import { toast } from "@powerhousedao/connect/services/toast";
import { ConnectDeleteItemModal } from "@powerhousedao/design-system/connect";
import {
  closePHModal,
  deleteNode,
  setSelectedNode,
  useNodeById,
  useNodeParentFolderById,
  usePHModal,
  useSelectedDriveId,
} from "@powerhousedao/reactor-browser";
import React from "react";
import { useTranslation } from "react-i18next";

export const DeleteItemModal: React.FC = () => {
  const phModal = usePHModal();
  const open = phModal?.type === "deleteItem";
  const id = open ? phModal.id : undefined;
  const { t } = useTranslation();
  const node = useNodeById(id);
  const name = node?.name;
  const kind = node?.kind;
  const selectedDriveId = useSelectedDriveId();
  const nodeParentFolder = useNodeParentFolderById(node?.parentFolder);
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

    setSelectedNode(nodeParentFolder);

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
