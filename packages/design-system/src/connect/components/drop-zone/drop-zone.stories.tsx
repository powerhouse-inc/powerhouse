import { type Meta, type StoryObj } from "@storybook/react";

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
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};


