import { documentTypes } from "@/connect/constants";
import { mockUiFileNode } from "@/connect/utils/mocks";
import { Meta, StoryObj } from "@storybook/react";
import { FileItem } from "./file-item";

const meta: Meta<typeof FileItem> = {
  title: "Connect/Components/FileItem",
  component: FileItem,
  decorators: [
    (Story) => (
      <div className="w-[500px] bg-white p-10">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    uiNode: mockUiFileNode,
    isAllowedToCreateDocuments: true,
  },
  render: function Wrapper(args) {
    const fileNodes = [...documentTypes, "SOME RANDOM DOCUMENT TYPE"].map(
      (documentType, index) => ({
        ...args.uiNode,
        documentType,
        id: `file-${index}`,
        name: `${documentType} document`,
      }),
    );
    return (
      <div className="flex flex-wrap gap-2">
        {fileNodes.map((node) => (
          <FileItem key={node.id} {...args} uiNode={node} />
        ))}
      </div>
    );
  },
};

export const NotAllowedToCreateDocuments: Story = {
  ...Default,
  args: {
    ...Default.args,
    isAllowedToCreateDocuments: false,
  },
};
