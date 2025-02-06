import { Icon } from "@/powerhouse";
import type { Meta, StoryObj } from "@storybook/react";
import { DefaultEditor } from "./default-editor";
import { DefaultEditorStory } from "./default-editor.stories";
import { PackageManagerProps } from "./package-manager";
import {
  WithLoading as PackageManagerStory,
  PackageManagerWrapper,
} from "./package-manager/package-manager.stories";
import { SettingsModal } from "./settings-modal";

const meta: Meta<typeof SettingsModal> = {
  title: "Connect/Components/Modal/SettingsModalV2",
  component: SettingsModal,
};

export default meta;
type Story = StoryObj<typeof meta>;
const tabs = [
  {
    id: "package-manager",
    icon: <Icon name="PackageManager" size={12} />,
    label: "Package Manager",
    content: (
      <PackageManagerWrapper
        {...(PackageManagerStory.args as PackageManagerProps)}
      />
    ),
  },
  {
    id: "default-editors",
    icon: <Icon name="Edit" size={12} />,
    label: "Default Editors",
    content: <DefaultEditor {...DefaultEditorStory.args} />,
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
];

export const Primary: Story = {
  args: {
    open: true,
    title: "Settings",
    tabs,
  },
};
