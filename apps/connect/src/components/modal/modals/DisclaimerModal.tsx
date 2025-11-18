import { ReadRequiredModal } from "@powerhousedao/design-system/connect";
import { closePHModal, usePHModal } from "@powerhousedao/reactor-browser";
import React from "react";
import { useTranslation } from "react-i18next";

export const DisclaimerModal: React.FC = () => {
  const phModal = usePHModal();
  const open = phModal?.type === "disclaimer";

  const { t } = useTranslation();

  return (
    <ReadRequiredModal
      open={open}
      header={t("modals.disclaimer.title")}
      body={t("modals.disclaimer.body")}
      closeLabel="Close"
      onContinue={() => closePHModal()}
    />
  );
};
