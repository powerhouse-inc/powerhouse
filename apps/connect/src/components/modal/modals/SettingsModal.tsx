import {
  Icon,
  SettingsModal as SettingsModalV2,
} from "@powerhousedao/design-system";
import { closePHModal, usePHModal } from "@powerhousedao/reactor-browser";
import { t } from "i18next";
import type React from "react";
import { useMemo } from "react";
import { About } from "./settings/about.js";
import { DangerZone } from "./settings/danger-zone.js";
import { DefaultEditor } from "./settings/default-editor.js";
import { PackageManager } from "./settings/package-manager.js";

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
        content: PackageManager,
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
        content: () => <DangerZone onRefresh={onRefresh} />,
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
