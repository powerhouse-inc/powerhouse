import { type Meta, type StoryObj } from "@storybook/react";
import { HomeScreenAddDriveItem } from "./home-screen-add-drive-item";

const meta = {
  title: "Connect/Components/Home Screen Add Drive Item",
  component: HomeScreenAddDriveItem,
} satisfies Meta<typeof HomeScreenAddDriveItem>;

export default meta;

type Story = StoryObj<typeof meta>;

const Template: Story = {
  args: {},
  decorators: [
    (Story) => (
      <div className="grid h-48 w-96 place-items-center bg-white">
        <Story />
      </div>
    ),
  ],
};

export const Default: Story = {
  ...Template,
};
