import { Icon } from "#powerhouse";
import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import type { SelectItem } from "./index.js";
import { Select } from "./index.js";

const meta: Meta<typeof Select> = {
  title: "Connect/Components/Select",
  component: Select,
};

export default meta;

type Story = StoryObj<{
  id: string;
  items: SelectItem<string>[];
}>;

const Template: Story = {
  args: {
    id: "drive-settings-select",
    items: [
      {
        value: "Private",
        icon: <Icon name="Hdd" />,
        description: "Only available to you",
      },
      {
        value: "Shared",
        icon: <Icon name="People" />,
        description: "Only available to people in this drive",
      },
      {
        value: "Public",
        icon: <Icon name="Globe" />,
        description: "Available to everyone",
        disabled: true,
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
  render: function Wrapper(args) {
    const [value, setValue] = useState(args.items[0].value);

    return <Select {...args} onChange={setValue} value={value} />;
  },
};
