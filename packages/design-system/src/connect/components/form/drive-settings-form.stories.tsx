import { type Meta, type StoryObj } from "@storybook/react";
import { DriveSettingsForm } from "./index.js";

const meta = {
  title: "Connect/Components/Drive Settings Form",
  component: DriveSettingsForm,
} satisfies Meta<typeof DriveSettingsForm>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    driveId: "drive-id",
    name: "Drive Name",
    sharingType: "LOCAL",
    availableOffline: true,
    onSubmit: (data) => {
      console.log(data);
    },
    closeModal: () => {},
    onDeleteDrive: () => {},
  },
  decorators: [
    (Story) => (
      <div className="h-[420px] bg-white p-8">
        <Story />
      </div>
    ),
  ],
};
