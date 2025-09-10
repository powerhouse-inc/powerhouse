import { type Meta, type StoryObj } from "@storybook/react";

import { action } from "@storybook/addon-actions";
import { DropZone } from "./drop-zone.js";

const meta: Meta<typeof DropZone> = {
  title: "Connect/Components/DropZone",
  component: DropZone,
  parameters: {
    layout: "fullscreen",
  },
  args: {
    title: "Drag your documents",
    subtitle: "to drop them in the currently selected folder.",
    onAddFile: action("onAddFile"),
    onMoveNode: action("onMoveNode"),
    onCopyNode: action("onCopyNode"),
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};


