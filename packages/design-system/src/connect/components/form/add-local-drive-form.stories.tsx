import { Meta, StoryObj } from "@storybook/react";
import { AddLocalDriveForm } from "./add-local-drive-form";

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
