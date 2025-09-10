import type { Meta, StoryObj } from "@storybook/react";
import { EditorUndoRedoButtons } from "./editor-undo-redo-buttons.js";

const meta: Meta = {
  title: "Connect/Components/Editor Undo Redo Buttons",
  component: EditorUndoRedoButtons,
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
