import { mockNodeOptions, mockUiFolderNode } from "@/connect/utils/mocks";
import { Meta, StoryObj } from "@storybook/react";
import { FolderItem } from "./folder-item";

const meta: Meta<typeof FolderItem> = {
  title: "Connect/Components/FolderItem",
  component: FolderItem,
};

export default meta;

type Story = StoryObj<typeof meta>;

export const ReadMode: Story = {
  args: {
    uiNode: mockUiFolderNode,
    isRemoteDrive: true,
    isAllowedToCreateDocuments: true,
    nodeOptions: mockNodeOptions,
    onMoveNode: () => Promise.resolve(),
    onAddFile: () => Promise.resolve(),
    onCopyNode: () => Promise.resolve(),
  },
  render: function Wrapper(args) {
    const folderNodes = Array.from({ length: 5 }).map((_, index) => ({
      ...args.uiNode,
      id: `folder-${index}`,
      name: `Folder ${index} lorem ipsum dolor sit amet consectetur adipiscing elit`,
    }));
    return (
      <div className="flex flex-wrap gap-2">
        {folderNodes.map((node) => (
          <FolderItem key={node.id} {...args} uiNode={node} />
        ))}
      </div>
    );
  },
};

export const NotAllowedToCreateDocuments: Story = {
  ...ReadMode,
  args: {
    ...ReadMode.args,
    isAllowedToCreateDocuments: false,
  },
};
