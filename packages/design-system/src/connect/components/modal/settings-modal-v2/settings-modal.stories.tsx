import { Icon } from "@/powerhouse";
import type { Meta, StoryObj } from "@storybook/react";
import { About } from "./about.js";
import { Default as AboutStory } from "./about.stories.js";
import { DangerZone } from "./danger-zone.js";
import { Default as DangerZoneStory } from "./danger-zone.stories.js";
import { DefaultEditor } from "./default-editor.js";
import { Default as DefaultEditorStory } from "./default-editor.stories.js";
import type { PackageManagerProps } from "./package-manager/package-manager.js";
import {
  WithLoading as PackageManagerStory,
  PackageManagerWrapper,
} from "./package-manager/package-manager.stories.js";
import { SettingsModal } from "./settings-modal.js";

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
    content: <DangerZone {...DangerZoneStory.args} />,
  },
  {
    id: "about",
    icon: <Icon name="QuestionSquare" size={12} />,
    label: "About",
    content: <About {...AboutStory.args} />,
  },
];

export const Primary: Story = {
  args: {
    open: true,
    title: "Settings",
    tabs,
    defaultTab: "about",
  },
  decorators: [
    (Story) => (
      <div className="h-dvh bg-gray-50">
        <Story />
      </div>
    ),
  ],
};
