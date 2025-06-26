import { documentTypes } from "#connect";
import { type Meta, type StoryObj } from "@storybook/react";
import { type FileNode } from "document-drive";
import { FileItem } from "./file-item.js";

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
    isAllowedToCreateDocuments: true,
  },
  render: function Wrapper(args) {
    const fileNodes = [...documentTypes, "SOME RANDOM DOCUMENT TYPE"].map(
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      (documentType, index) => ({
        ...args.uiNode,
        documentType,
        id: `file-${index}`,
        name: `${documentType} document`,
      }),
    ) as FileNode[];
    return (
      <div className="flex flex-wrap gap-2">
        {fileNodes.map((node) => (
          <FileItem
            key={node.id}
            {...args}
            node={node}
            driveId="drive-id"
            sharingType="LOCAL"
            isAllowedToCreateDocuments={true}
            setSelectedDocument={() => {}}
            getSyncStatusSync={() => "SYNCING"}
            onRenameNode={() => {}}
            onDeleteNode={() => {}}
            onAddFile={() => {}}
            onCopyNode={() => {}}
            onMoveNode={() => {}}
          />
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
