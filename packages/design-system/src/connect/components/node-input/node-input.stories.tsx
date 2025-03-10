import { type Meta, type StoryObj } from "@storybook/react";
import { NodeInput } from "./node-input";

const meta: Meta<typeof NodeInput> = {
  title: "Connect/Components/Node Input",
  component: NodeInput,
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
