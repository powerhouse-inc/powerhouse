import { documentTypes } from "@powerhousedao/design-system";
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
    const node: FileNode = {
      name: "Mock file",
      id: "1",
      kind: "file",
      documentType: "mock",
      parentFolder: "1",
    };
    const fileNodes = [...documentTypes, "SOME RANDOM DOCUMENT TYPE"].map(
      (documentType, index) => ({
        ...node,
        documentType,
        id: `file-${index}`,
        name: `${documentType} document`,
      }),
    );
    return (
      <div className="flex flex-wrap gap-2">
        {fileNodes.map((node) => (
          <FileItem
            key={node.id}
            fileNode={node}
            {...args}
            onAddFile={() => Promise.resolve()}
            onAddFolder={() => Promise.resolve(undefined)}
            onRenameNode={() => Promise.resolve(undefined)}
            onCopyNode={() => Promise.resolve(undefined)}
            onMoveNode={() => Promise.resolve(undefined)}
            onDuplicateNode={() => Promise.resolve(undefined)}
            onAddAndSelectNewFolder={() => Promise.resolve(undefined)}
            showDeleteNodeModal={() => Promise.resolve(undefined)}
            setSelectedNode={() => {}}
            sharingType="LOCAL"
            getSyncStatusSync={() => undefined}
            isAllowedToCreateDocuments={true}
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
