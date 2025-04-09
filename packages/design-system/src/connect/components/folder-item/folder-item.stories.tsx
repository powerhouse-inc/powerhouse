import { mockUiFolderNode } from "#connect";
import { type Meta, type StoryObj } from "@storybook/react";
import { FolderItem } from "./folder-item.js";

const meta: Meta<typeof FolderItem> = {
  title: "Connect/Components/FolderItem",
  component: FolderItem,
};

export default meta;

type Story = StoryObj<typeof meta>;

export const ReadMode: Story = {
  args: {
    uiNode: { ...mockUiFolderNode, syncStatus: undefined },
    isAllowedToCreateDocuments: true,
    onMoveNode: () => Promise.resolve(),
    onAddFile: () => Promise.resolve(),
    onCopyNode: () => Promise.resolve(),
  },
  render: function Wrapper(args) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    const folderNodes = Array.from({ length: 5 }).map((_, index) => ({
      ...args.uiNode,
      id: `folder-${index}`,
      name: `Folder ${index} lorem ipsum dolor sit amet consectetur adipiscing elit`,
    }));
    return (
      <div className="flex flex-wrap gap-2">
        {folderNodes.map((node) => (
          // @ts-expect-error
          <FolderItem
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
            key={node.id}
            {...args}
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            uiNode={node}
          />
        ))}
      </div>
    );
  },
};

export const NotAllowedToCreateDocuments: Story = {
  ...ReadMode,
  args: {
    ...ReadMode.args,
    uiNode: mockUiFolderNode,
    isAllowedToCreateDocuments: false,
  },
};
