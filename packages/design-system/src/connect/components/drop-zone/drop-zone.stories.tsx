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
      <div className="flex h-screen items-center justify-center bg-gray-50 dark:bg-slate-800">
        <div className="rounded-lg border border-gray-300 bg-gray-50 p-8 shadow-sm dark:border-slate-500 dark:bg-slate-600 dark:text-slate-100">
          <div className="text-sm text-gray-700 dark:text-slate-200">
            Drag files over this page to trigger the DropZone overlay.
          </div>
        </div>
      </div>
    ),
    onAddFile: async (file, parent, onProgress) => {
      action("onAddFile")(file, parent, onProgress);
      // Mock progress updates
      await new Promise((resolve) => setTimeout(resolve, 100));
      onProgress?.({ stage: "loading", progress: 0 });
      await new Promise((resolve) => setTimeout(resolve, 100));
      onProgress?.({ stage: "uploading", progress: 50 });
      await new Promise((resolve) => setTimeout(resolve, 100));
      onProgress?.({ stage: "complete", progress: 100 });
      // Return mock FileNode
      return {
        id: "mock-file-id",
        name: file.name,
        kind: "file",
        parentFolder: "mock-parent-id",
      };
    },
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
