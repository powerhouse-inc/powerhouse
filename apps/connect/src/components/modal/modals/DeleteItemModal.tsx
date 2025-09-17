import { ConnectDeleteItemModal } from "@powerhousedao/design-system";
import { useNodeKind, useNodeName } from "@powerhousedao/reactor-browser";
import React from "react";
import { useTranslation } from "react-i18next";

export interface DeleteItemModalProps {
  id: string;
  open: boolean;
  onDelete: (closeModal: () => void) => void;
  onClose: () => void;
}

export const DeleteItemModal: React.FC<DeleteItemModalProps> = (props) => {
  const { t } = useTranslation();
  const { id, open, onClose, onDelete } = props;
  const name = useNodeName(id);
  const kind = useNodeKind(id);

  if (!name || !kind) {
    return null;
  }

  return (
    <ConnectDeleteItemModal
      open={open}
      onDelete={() => onDelete(onClose)}
      onCancel={() => onClose()}
      header={t(`modals.deleteItem.${kind.toLowerCase()}.header`, {
        item: name,
      })}
      body={t(`modals.deleteItem.${kind.toLowerCase()}.body`)}
      cancelLabel={t("common.cancel")}
      deleteLabel={t("common.delete")}
    />
  );
};
