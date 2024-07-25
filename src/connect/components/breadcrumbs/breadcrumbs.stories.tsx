import {
    DRIVE,
    FOLDER,
    mockDriveNodes,
    SUCCESS,
    UiFolderNode,
    UiNodesContextProvider,
    useUiNodesContext,
} from '@/connect';
import { Meta, StoryObj } from '@storybook/react';
import { useEffect } from 'react';
import { Breadcrumbs } from '.';

const meta: Meta<typeof Breadcrumbs> = {
    title: 'Connect/Components/Breadcrumbs',
    component: Breadcrumbs,
    decorators: [
        Story => {
            return (
                <UiNodesContextProvider>
                    <Story />
                </UiNodesContextProvider>
            );
        },
    ],
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
    args: {
        isAllowedToCreateDocuments: true,
    },
    render: function Wrapper(args) {
        const {
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
                    selectedNode.kind === DRIVE
                        ? selectedNode.id
                        : selectedNode.driveId,
                id: `new-folder-${Math.floor(Math.random() * 1000)}`,
                kind: FOLDER,
                name,
                slug: name.toLowerCase().replace(/\s/g, '-'),
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

        return (
            <div className="bg-white p-10">
                <Breadcrumbs
                    {...args}
                    selectedNodePath={selectedNodePath}
                    setSelectedNode={setSelectedNode}
                    onAddAndSelectNewFolder={onAddAndSelectNewFolder}
                />
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
