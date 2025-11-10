import { About } from "@powerhousedao/connect/components/modal/modals/settings/about";
import { DangerZone } from "@powerhousedao/connect/components/modal/modals/settings/danger-zone";
import { DefaultEditor } from "@powerhousedao/connect/components/modal/modals/settings/default-editor";
import { ConnectPackageManager } from "@powerhousedao/connect/components/modal/modals/settings/package-manager";
import { SettingsModal as SettingsModalV2 } from "@powerhousedao/design-system/connect/components/modal/settings-modal-v2/settings-modal";
import { Icon } from "@powerhousedao/design-system/powerhouse/components/icon/icon";
import { closePHModal, usePHModal } from "@powerhousedao/reactor-browser";
import { t } from "i18next";
import React, { useMemo } from "react";

export const SettingsModal: React.FC = () => {
  const phModal = usePHModal();
  const open = phModal?.type === "settings";
  function onRefresh() {
    window.location.reload();
  }

  const tabs = useMemo(
    () => [
      {
        id: "package-manager",
        icon: <Icon name="PackageManager" size={12} />,
        label: "Package Manager",
        content: ConnectPackageManager,
      },
      {
        id: "default-editors",
        icon: <Icon name="Edit" size={12} />,
        label: "Default Editors",
        content: DefaultEditor,
      },
      {
        id: "danger-zone",
        icon: <Icon name="Danger" size={12} className="text-red-900" />,
        label: <span className="text-red-900">Danger Zone</span>,
        content: () => <DangerZone />,
      },
      {
        id: "about",
        icon: <Icon name="QuestionSquare" size={12} />,
        label: "About",
        content: About,
      },
    ],
    [onRefresh],
  );

  return (
    <SettingsModalV2
      open={open}
      title={t("modals.connectSettings.title")}
      onOpenChange={(status: boolean) => {
        if (!status) return closePHModal();
      }}
      tabs={tabs}
    />
  );
};
