import type { Meta, StoryObj } from "@storybook/react";
import type { DocumentDriveDocument } from "document-drive";
import { DriveSettingsForm } from "./index.js";

const meta = {
  title: "Connect/Components/Drive Settings Form",
  component: DriveSettingsForm,
} satisfies Meta<typeof DriveSettingsForm>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    onSubmit: (data) => {
      console.log(data);
    },
    handleCancel: () => {},
    handleDeleteDrive: () => {},
    sharingType: "LOCAL",
    availableOffline: true,
    drive: {
      header: {
        id: "1",
        name: "Drive 1",
      },
    } as DocumentDriveDocument,
  },
  decorators: [
    (Story) => (
      <div className="h-[420px] bg-white p-8">
        <Story />
      </div>
    ),
  ],
};
