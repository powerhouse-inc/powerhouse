import type { Meta, StoryObj } from "@storybook/react";
import { EditorActionButtons } from "./editor-action-buttons.js";

const meta: Meta = {
  title: "Connect/Components/Editor Action Buttons",
  component: EditorActionButtons,
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
