import {
  mockCloudDrive,
  mockLocalDrive,
  mockPublicDrive,
  type UiDriveNode,
} from "#connect";
import { Icon } from "#powerhouse";
import type { Meta, StoryObj } from "@storybook/react";
import React from "react";
import mockPackageJson from "../../../utils/mocks/mock-package-json.json";
import { About } from "./about.js";
import { DangerZone } from "./danger-zone.js";
import { DefaultEditor } from "./default-editor.js";
import { mockDocumentModelEditorOptions } from "./mocks.js";
import { PackageManagerWrapper } from "./package-manager/package-manager.stories.js";
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
    content: () => {
      const [reactor, setReactor] = React.useState("");
      return (
        <PackageManagerWrapper
          reactor={reactor}
          onReactorChange={(value) => setReactor(value || "")}
        />
      );
    },
  },
  {
    id: "default-editors",
    icon: <Icon name="Edit" size={12} />,
    label: "Default Editors",
    content() {
      const [editor, setEditor] = React.useState(
        mockDocumentModelEditorOptions[0].value,
      );
      return (
        <DefaultEditor
          documentModelEditor={editor}
          setDocumentModelEditor={setEditor}
          documentModelEditorOptions={mockDocumentModelEditorOptions}
        />
      );
    },
  },
  {
    id: "danger-zone",
    icon: <Icon name="Danger" size={12} className="text-red-900" />,
    label: <span className="text-red-900">Danger Zone</span>,
    content() {
      const [drives, setDrives] = React.useState([
        mockCloudDrive,
        mockLocalDrive,
        mockPublicDrive,
      ]);
      return (
        <DangerZone
          drives={drives}
          onDeleteDrive={(uiDriveNode: UiDriveNode) => {
            setDrives((drives) =>
              drives.filter((d) => d.id !== uiDriveNode.driveId),
            );
          }}
          onClearStorage={() => setDrives([])}
        />
      );
    },
  },
  {
    id: "about",
    icon: <Icon name="QuestionSquare" size={12} />,
    label: "About",
    content() {
      return <About packageJson={mockPackageJson} />;
    },
  },
];
export const Primary: Story = {
  args: {
    open: true,
    title: "Settings",
    tabs,
  },
  decorators: [
    (Story) => (
      <div className="h-dvh bg-gray-50">
        <Story />
      </div>
    ),
  ],
  render: function Wrapper(args) {
    return (
      // @ts-expect-error
      <SettingsModal {...args} />
    );
  },
};
