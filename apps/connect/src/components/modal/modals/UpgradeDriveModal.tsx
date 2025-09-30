import { ConnectUpgradeDriveModal } from "@powerhousedao/design-system";
import { closePHModal, usePHModal } from "@powerhousedao/reactor-browser";
import type React from "react";
import { useTranslation } from "react-i18next";

export const UpgradeDriveModal: React.FC = () => {
  const phModal = usePHModal();
  const open = phModal?.type === "upgradeDrive";
  const driveId = open ? phModal.driveId : undefined;

  const { t } = useTranslation();

  const onContinue = () => {
    // TODO: Implement upgrade drive
    console.log("Upgrade drive: ", driveId);
    closePHModal();
  };

  return (
    <ConnectUpgradeDriveModal
      open={open}
      onContinue={onContinue}
      header={t("modals.upgradeDrive.header")}
      body={t("modals.upgradeDrive.body")}
      cancelLabel={t("common.cancel")}
      continueLabel={t("common.continue")}
      onOpenChange={(status: boolean) => {
        if (!status) return closePHModal();
      }}
    />
  );
};
