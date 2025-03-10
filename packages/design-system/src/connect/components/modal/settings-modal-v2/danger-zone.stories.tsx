import { type UiDriveNode } from "@/connect/types/nodes.js";
import {
  mockCloudDrive,
  mockLocalDrive,
  mockPublicDrive,
} from "@/connect/utils/mocks/ui-drive-node.js";
import { useArgs } from "@storybook/preview-api";
import { type Meta, type StoryObj } from "@storybook/react";
import { useCallback } from "react";
import { DangerZone } from "./danger-zone.js";

const meta = {
  title: "Connect/Components/SettingsModalV2/Danger Zone",
  component: DangerZone,
} satisfies Meta<typeof DangerZone>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    drives: [mockCloudDrive, mockLocalDrive, mockPublicDrive],
    onDeleteDrive: () => {},
    onClearStorage: () => {},
  },
  render: function Wrapper(args) {
    const [, setArgs] = useArgs<typeof args>();
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
      <DangerZone
        {...args}
        onClearStorage={onClearStorage}
        onDeleteDrive={onDeleteDrive}
      />
    );
  },
};
