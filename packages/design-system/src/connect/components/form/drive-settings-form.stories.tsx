import { mockLocalDrive } from "#connect";
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
    onSubmit: (data) => {
      console.log(data);
    },
    handleCancel: () => {},
    handleDeleteDrive: () => {},
    uiDriveNode: mockLocalDrive,
  },
  decorators: [
    (Story) => (
      <div className="h-[420px] bg-white p-8">
        <Story />
      </div>
    ),
  ],
};
