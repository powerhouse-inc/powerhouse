import { Icon } from "#powerhouse";
import { type Meta, type StoryObj } from "@storybook/react";
import { HomeScreenItem } from "./home-screen-item.js";

const meta = {
  title: "Connect/Components/Home Screen Item",
  component: HomeScreenItem,
} satisfies Meta<typeof HomeScreenItem>;

export default meta;

type Story = StoryObj<typeof meta>;

const Template: Story = {
  args: {
    title: "Frank Inc.",
    icon: <Icon name="Drive" />,
    description: "Contributor App",
  },
  decorators: [
    (Story) => (
      <div className="grid h-48 w-96 place-items-center bg-white">
        <Story />
      </div>
    ),
  ],
};

const TemplateShareable: Story = {
  args: {
    title: "Frank Inc.",
    icon: <Icon name="Drive" />,
    description: "Contributor App",
    shareable: true,
  },
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

export const Shareable: Story = {
  ...TemplateShareable,
};
