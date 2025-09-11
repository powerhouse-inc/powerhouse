import type { StoryObj } from "@storybook/react";
import { useState } from "react";
import { Toggle } from "./toggle.js";

const meta = {
  title: "Connect/Components/Toggle",
  component: Toggle,
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    id: "toggle",
    name: "Toggle",
  },
  render: function Wrapper(args) {
    const [checked, setChecked] = useState(false);

    return (
      <Toggle
        {...args}
        checked={checked}
        onChange={() => setChecked(!checked)}
      />
    );
  },
};
