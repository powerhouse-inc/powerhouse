import type { Meta, StoryObj } from "@storybook/react";
import type { FolderNode } from "document-drive";
import { FolderItem } from "./folder-item.js";

const meta: Meta<typeof FolderItem> = {
  title: "Connect/Components/FolderItem",
  component: FolderItem,
};

export default meta;

type Story = StoryObj<typeof meta>;

export const ReadMode: Story = {
  render: function Wrapper() {
    const folderNode: FolderNode = {
      id: "1",
      name: "Folder 1",
      kind: "folder",
      parentFolder: "1",
    };
    const folderNodes = Array.from({ length: 5 }).map((_, index) => ({
      ...folderNode,
      id: `folder-${index}`,
      name: `Folder ${index} lorem ipsum dolor sit amet consectetur adipiscing elit`,
    }));
    return (
      <div className="flex flex-wrap gap-2">
        {folderNodes.map((node) => (
          <FolderItem
            key={node.id}
            folderNode={node}
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
  ...ReadMode,
  args: {
    ...ReadMode.args,
    isAllowedToCreateDocuments: false,
  },
};
