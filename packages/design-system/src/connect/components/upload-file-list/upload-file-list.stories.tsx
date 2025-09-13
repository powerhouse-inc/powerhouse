import { type Meta, type StoryObj } from "@storybook/react";
import { fn } from "@storybook/test";

import { type UploadFileItemProps } from "../upload-file-item/upload-file-item.js";
import { UploadFileList } from "./upload-file-list.js";

const sampleItems: ReadonlyArray<UploadFileItemProps> = [
  {
    fileName: "ClydesdaleStatement.phdm",
    fileSize: "2.76 MB",
    status: "success",
    onOpenDocument: fn(),
  },
  {
    fileName: "subgraph.phdm",
    fileSize: "4 MB",
    status: "failed",
    errorDetails:
      "Upload failed. Install the corresponding drive-app that supports this document.",
  },
  {
    fileName: "subgraph.phdm",
    fileSize: "4 MB",
    status: "pending",
    onFindResolution: fn(),
  },
  {
    fileName: "Debt Ceiling.phdm",
    fileSize: "3.1 MB",
    status: "uploading",
    progress: 75,
  },
  {
    fileName: "Debt Ceiling.phdm",
    fileSize: "3.1 MB",
    status: "uploading",
    progress: 34,
  },
];

const meta: Meta<typeof UploadFileList> = {
  title: "Connect/Components/UploadFileList",
  component: UploadFileList,
  parameters: {
    layout: "centered",
  },
  args: {
    items: sampleItems,
    defaultCollapsed: false,
    onClose: fn(),
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Expanded: Story = {
  args: {
    defaultCollapsed: false,
  },
};

export const Collapsed: Story = {
  args: {
    defaultCollapsed: true,
  },
};
