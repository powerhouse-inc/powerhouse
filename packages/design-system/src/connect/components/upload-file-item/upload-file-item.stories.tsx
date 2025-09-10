import { type Meta, type StoryObj } from "@storybook/react";
import { fn } from "@storybook/test";
import { UploadFileItem } from "./upload-file-item";

const meta: Meta<typeof UploadFileItem> = {
  title: "Connect/Components/UploadFileItem",
  component: UploadFileItem,
  parameters: {
    layout: "centered",
  },
  argTypes: {
    status: {
      control: "select",
      options: ["success", "failed", "pending", "uploading"],
    },
    progress: {
      control: { type: "range", min: 0, max: 100, step: 1 },
    },
  },
  args: {
    fileName: "Document.phdm",
    fileSize: "1.0 MB",
    status: "success",
    onClose: fn(),
    onOpenDocument: fn(),
    onFindResolution: fn(),
  },
};

export default meta;

type Story = StoryObj<typeof meta>;

const Template: Story = {
  args: {},
  decorators: [
    (Story) => (
      <div className="flex h-screen w-[338px] items-center justify-center bg-gray-50 p-8">
        <Story />
      </div>
    ),
  ],
};

export const Success: Story = {
  ...Template,
  args: {
    fileName: "ClydesdaleStatement.phdm",
    fileSize: "2.76 MB",
    status: "success",
    onOpenDocument: fn(),
  },
};

export const Failed: Story = {
  ...Template,
  args: {
    fileName: "subgraph.phdm",
    fileSize: "4 MB",
    status: "failed",
    errorDetails:
      "Upload failed. Install the corresponding drive-app that supports this document.",
  },
};

export const PendingResolution: Story = {
  ...Template,
  args: {
    fileName: "subgraph.phdm",
    fileSize: "2.76 MB",
    status: "pending",
    onFindResolution: fn(),
  },
};

export const Uploading: Story = {
  ...Template,
  args: {
    fileName: "Debt Ceiling.phdm",
    fileSize: "3.1 MB",
    status: "uploading",
    progress: 75,
  },
};

export const UploadingLowProgress: Story = {
  ...Template,
  args: {
    fileName: "Budget Analysis.phdm",
    fileSize: "1.2 MB",
    status: "uploading",
    progress: 25,
  },
};

export const UploadingHighProgress: Story = {
  ...Template,
  args: {
    fileName: "Financial Report.phdm",
    fileSize: "5.8 MB",
    status: "uploading",
    progress: 95,
  },
};

export const WithoutCloseButton: Story = {
  ...Template,
  args: {
    fileName: "Document.phdm",
    fileSize: "1.5 MB",
    status: "success",
    onClose: undefined,
  },
};

export const LongFileName: Story = {
  ...Template,
  args: {
    fileName: "Very Long Document Name That Might Overflow.phdm",
    fileSize: "8.2 MB",
    status: "success",
    onOpenDocument: fn(),
  },
};

export const Interactive: Story = {
  ...Template,
  args: {
    fileName: "Interactive Document.phdm",
    fileSize: "2.1 MB",
    status: "success",
    onOpenDocument: fn(),
    onClose: fn(),
  },
  parameters: {
    docs: {
      description: {
        story:
          "Interactive story with all handlers. You can click the buttons to see the actions in the Actions panel.",
      },
    },
  },
};
