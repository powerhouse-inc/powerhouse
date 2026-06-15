import {
  SettingsModal as SettingsModalV2,
  ThemeSwitch,
} from "@powerhousedao/design-system/connect";
import { closePHModal, usePHModal } from "@powerhousedao/reactor-browser";
import { t } from "i18next";
import { CircleHelp, Package, PenLine, TriangleAlert } from "lucide-react";
import React, { useMemo } from "react";
import { About } from "./settings/about.js";
import { DangerZone } from "./settings/danger-zone.js";
import { DefaultEditor } from "./settings/default-editor.js";
import { ConnectPackageManager } from "./settings/package-manager.js";

const iconProps = { size: 16 } as const;

export const SettingsModal: React.FC = () => {
  const phModal = usePHModal();
  const open = phModal?.type === "settings";

  const tabs = useMemo(
    () => [
      {
        id: "package-manager",
        icon: <Package {...iconProps} />,
        label: "Package Manager",
        content: ConnectPackageManager,
      },
      {
        id: "default-editors",
        icon: <PenLine {...iconProps} />,
        label: "Default Editors",
        content: DefaultEditor,
      },
      {
        id: "danger-zone",
        icon: <TriangleAlert {...iconProps} className="text-destructive" />,
        label: <span className="text-destructive">Danger Zone</span>,
        content: () => <DangerZone />,
      },
      {
        id: "about",
        icon: <CircleHelp {...iconProps} />,
        label: "About",
        content: About,
      },
    ],
    [],
  );

  return (
    <SettingsModalV2
      open={open}
      title={t("modals.connectSettings.title")}
      onOpenChange={(status: boolean) => {
        if (!status) return closePHModal();
      }}
      tabs={tabs}
      navFooter={<ThemeSwitch horizontal />}
    />
  );
};
