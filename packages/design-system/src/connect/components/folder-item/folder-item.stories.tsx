import { type Meta, type StoryObj } from "@storybook/react";
import { type FolderNode } from "document-drive";
import { FolderItem } from "./folder-item.js";

const meta: Meta<typeof FolderItem> = {
  title: "Connect/Components/FolderItem",
  component: FolderItem,
};

export default meta;

type Story = StoryObj<typeof meta>;

export const ReadMode: Story = {
  args: {
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
    })) as FolderNode[];
    return (
      <div className="flex flex-wrap gap-2">
        {folderNodes.map((node) => (
          <FolderItem
            key={node.id}
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
  ...ReadMode,
  args: {
    ...ReadMode.args,
    isAllowedToCreateDocuments: false,
  },
};
