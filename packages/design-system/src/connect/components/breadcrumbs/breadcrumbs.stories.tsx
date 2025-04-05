import {
  DRIVE,
  FOLDER,
  mockDriveNodes,
  SUCCESS,
  type UiFolderNode,
} from "#connect";
import {
  UiNodesContextProvider,
  useUiNodesContext,
} from "@powerhousedao/reactor-browser";
import { type Meta, type StoryObj } from "@storybook/react";
import { useEffect } from "react";
import { Breadcrumbs } from "./index.js";

const meta: Meta<typeof Breadcrumbs> = {
  title: "Connect/Components/Breadcrumbs",
  component: Breadcrumbs,
  decorators: [
    (Story, { args }) => {
      return (
        <UiNodesContextProvider>
          <Story {...args} />
        </UiNodesContextProvider>
      );
    },
  ],
};

export default meta;

type Story = StoryObj<typeof Breadcrumbs>;

export const Default: Story = {
  args: {
    createEnabled: true,
  },
  render: function Wrapper(args) {
    const {
      getNodeById,
      setDriveNodes,
      setSelectedNode,
      selectedNode,
      selectedDriveNode,
      selectedNodePath,
    } = useUiNodesContext();

    useEffect(() => {
      setDriveNodes(mockDriveNodes);
    }, []);

    useEffect(() => {
      setSelectedNode(mockDriveNodes[0].children[0]);
    }, []);

    // stub implementation to mock behavior
    async function onAddAndSelectNewFolder(name: string) {
      if (!selectedNode) return;

      const newFolderNode: UiFolderNode = {
        driveId:
          selectedNode.kind === DRIVE ? selectedNode.id : selectedNode.driveId,
        id: `new-folder-${Math.floor(Math.random() * 1000)}`,
        kind: FOLDER,
        name,
        slug: name.toLowerCase().replace(/\s/g, "-"),
        parentFolder: selectedNode.id,
        syncStatus: SUCCESS,
        children: [],
        sharingType: selectedNode.sharingType,
      };

      setDriveNodes([
        {
          ...selectedDriveNode!,
          children: [...selectedDriveNode!.children, newFolderNode],
          nodeMap: {
            ...selectedDriveNode!.nodeMap,
            [newFolderNode.id]: newFolderNode,
          },
        },
      ]);
      setSelectedNode(newFolderNode);

      return Promise.resolve();
    }

    const onCreateProp = args.createEnabled
      ? {
          onCreate: onAddAndSelectNewFolder,
        }
      : {};

    return (
      <div className="bg-white p-10">
        <Breadcrumbs
          {...args}
          breadcrumbs={selectedNodePath}
          onBreadcrumbSelected={(b) => setSelectedNode(getNodeById(b.id))}
          {...onCreateProp}
        />
      </div>
    );
  },
};

export const NotAllowedToCreateDocuments: Story = {
  ...Default,
  args: {
    ...Default.args,
    createEnabled: false,
  },
};
