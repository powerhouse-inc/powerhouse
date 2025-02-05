import { Icon } from "@/powerhouse";
import type { Meta, StoryObj } from "@storybook/react";

import { PackageManagerWrapper } from "./package-manager/package-manager.stories";
import { SettingsModal } from "./settings-modal";

const meta: Meta<typeof SettingsModal> = {
  title: "Connect/Components/Modal/SettingsModalV2",
  component: SettingsModal,
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {
  args: {
    open: true,
    title: "Settings",
    tabs: [
      {
        id: "package-manager",
        icon: <Icon name="PackageManager" size={12} />,
        label: "Package Manager",
        content: PackageManagerWrapper,
      },
      {
        id: "default-editors",
        icon: <Icon name="Edit" size={12} />,
        label: "Default Editors",
        content: "Default Editors Content",
      },
      {
        id: "danger-zone",
        icon: <Icon name="Danger" size={12} className="text-red-900" />,
        label: <span className="text-red-900">Danger Zone</span>,
        content: "Danger Zone Content",
      },
      {
        id: "about",
        icon: <Icon name="QuestionSquare" size={12} />,
        label: "About",
        content: "About Content",
      },
    ],
  },
};
