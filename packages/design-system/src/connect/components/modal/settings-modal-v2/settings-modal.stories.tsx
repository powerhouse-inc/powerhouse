import { UiDriveNode } from "@/connect/types/nodes.js";
import {
  mockCloudDrive,
  mockLocalDrive,
  mockPublicDrive,
} from "@/connect/utils/mocks/ui-drive-node.js";
import { Icon } from "@/powerhouse";
import { useArgs, useCallback } from "@storybook/preview-api";
import type { Meta, StoryObj } from "@storybook/react";
import { About } from "./about.js";
import { DangerZone } from "./danger-zone.js";
import { DefaultEditor } from "./default-editor.js";
import {
  mockDocumentModelEditorOptions,
  mockPackages,
  mockReactorOptions,
} from "./mocks.js";
import { PackageManager } from "./package-manager/package-manager.js";
import { SettingsModal } from "./settings-modal.js";
import mockPackageJson from "../../../utils/mocks/mock-package-json.json";

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
    content: DangerZone,
  },
  {
    id: "about",
    icon: <Icon name="QuestionSquare" size={12} />,
    label: "About",
    content: About,
  },
];
export const Primary: Story = {
  args: {
    open: true,
    title: "Settings",
    tabs,
    reactor: "local-reactor",
    reactorOptions: mockReactorOptions,
    documentModelEditorOptions: mockDocumentModelEditorOptions,
    documentModelEditor: mockDocumentModelEditorOptions[0].value,
    packages: mockPackages,
    drives: [mockCloudDrive, mockLocalDrive, mockPublicDrive],
    packageJson: mockPackageJson,
  },
  decorators: [
    (Story) => (
      <div className="h-dvh bg-gray-50">
        <Story />
      </div>
    ),
  ],
  render: function Wrapper(args) {
    const [, setArgs] = useArgs<typeof args>();
    function onInstall(): Promise<void> {
      return new Promise((resolve) => setTimeout(() => resolve(), 1000));
    }

    function onUninstall(): Promise<void> {
      return new Promise((resolve) => setTimeout(() => resolve(), 1000));
    }

    function onReactorChange(reactor: string | undefined): void {
      setArgs({ ...args, reactor });
    }

    function setDocumentModelEditor(documentModelEditor: string): void {
      setArgs({ ...args, documentModelEditor });
    }

    const onClearStorage = useCallback(() => {
      alert("You cleared the storage. Good for you.");
    }, []);
    const onDeleteDrive = useCallback(
      (drive: UiDriveNode) => {
        setArgs({
          drives: args.drives.filter((d) => d.id !== drive.id),
        });
      },
      [args.drives, setArgs],
    );

    return (
      <SettingsModal
        {...args}
        onInstall={onInstall}
        onUninstall={onUninstall}
        onReactorChange={onReactorChange}
        setDocumentModelEditor={setDocumentModelEditor}
        onClearStorage={onClearStorage}
        onDeleteDrive={onDeleteDrive}
      />
    );
  },
};
