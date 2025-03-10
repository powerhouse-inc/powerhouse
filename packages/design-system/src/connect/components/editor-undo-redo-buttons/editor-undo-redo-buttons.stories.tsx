import { type Meta, type StoryObj } from "@storybook/react";
import { EditorUndoRedoButtons } from "./editor-undo-redo-buttons";

const meta: Meta = {
  title: "Connect/Components/Editor Undo Redo Buttons",
  component: EditorUndoRedoButtons,
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
