import { useArgs } from "@storybook/preview-api";
import type { Meta, StoryObj } from "@storybook/react";
import type { DocumentDriveDocument } from "document-drive";
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
    drives: [
      {
        header: {
          id: "1",
          name: "Drive 1",
        },
      } as DocumentDriveDocument,
      {
        header: {
          id: "2",
          name: "Drive 2",
        },
      } as DocumentDriveDocument,
    ],
    onDeleteDrive: () => {},
    onClearStorage: () => {},
  },
  render: function Wrapper(args) {
    const [, setArgs] = useArgs<typeof args>();
    const onClearStorage = useCallback(() => {
      alert("You cleared the storage. Good for you.");
    }, []);
    const onDeleteDrive = useCallback(
      (drive: DocumentDriveDocument) => {
        setArgs({
          drives: args.drives.filter((d) => d.header.id !== drive.header.id),
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
