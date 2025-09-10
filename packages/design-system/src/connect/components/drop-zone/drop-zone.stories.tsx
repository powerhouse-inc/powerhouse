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
    enable: true,
    children: (
      <div className="flex h-screen items-center justify-center bg-zinc-50">
        <div className="rounded-lg border border-zinc-200 bg-white p-8 shadow-sm">
          <div className="text-sm text-zinc-600">
            Drag files over this page to trigger the DropZone overlay.
          </div>
        </div>
      </div>
    ),
    onAddFile: action("onAddFile"),
    onMoveNode: action("onMoveNode"),
    onCopyNode: action("onCopyNode"),
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Disabled: Story = {
  args: {
    enable: false,
  },
};


