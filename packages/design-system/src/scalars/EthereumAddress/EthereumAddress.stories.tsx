import { type Meta, type StoryObj } from "@storybook/react";
import { useState } from "react";
import { EthereumAddress } from "./EthereumAddress.js";

const meta = {
  title: "Scalars/EthereumAddress",
  component: EthereumAddress,
  argTypes: {},
} satisfies Meta<typeof EthereumAddress>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    value: "0x123",
    onChange: () => {},
    error: undefined,
  },
  render: function Render(args) {
    const [value, setValue] = useState(args.value);

    return (
      <EthereumAddress
        {...args}
        value={value}
        onChange={(e) => {
          setValue(e);
        }}
      />
    );
  },
};
