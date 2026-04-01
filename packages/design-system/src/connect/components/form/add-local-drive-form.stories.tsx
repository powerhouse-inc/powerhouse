import type { Meta, StoryObj } from "@storybook/react";
import { AddLocalDriveForm } from "./add-local-drive-form.js";

const meta = {
  title: "Connect/Components/Create Local Drive Form",
  component: AddLocalDriveForm,
} satisfies Meta<typeof AddLocalDriveForm>;

export default meta;

type Story = StoryObj<typeof meta>;

const Template: Story = {
  args: {
    onSubmit: (data) => {
      console.log(data);
    },
    onCancel: () => {},
    appOptions: [
      {
        id: "powerhouse/common",
        name: "Generic Drive Explorer",
        sharingType: "LOCAL",
        availableOffline: false,
      },
      {
        id: "powerhouse/invoice/contributor",
        name: "Contributor App",
        sharingType: "LOCAL",
        availableOffline: false,
      },
      {
        id: "powerhouse/invoice/administrator",
        name: "OH Administrator App",
        sharingType: "LOCAL",
        availableOffline: false,
      },
    ],
  },
  decorators: [
    (Story) => (
      <div className="h-[420px] bg-white p-8">
        <Story />
      </div>
    ),
  ],
};

export const Default: Story = {
  ...Template,
};
