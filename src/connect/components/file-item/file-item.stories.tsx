import {
    mockNodeOptions,
    mockUiFileNode,
    mockUiFolderNode,
} from '@/connect/utils';
import { Meta, StoryObj } from '@storybook/react';
import { FileItem } from './file-item';

const meta: Meta<typeof FileItem> = {
    title: 'Connect/Components/FileItem',
    component: FileItem,
    decorators: [
        Story => (
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
        uiFileNode: mockUiFileNode,
        isRemoteDrive: true,
        isAllowedToCreateDocuments: true,
        nodeOptions: mockNodeOptions,
        selectedNodePath: [
            mockUiFolderNode,
            mockUiFolderNode,
            mockUiFolderNode,
            mockUiFileNode,
        ],
    },
    render: function Wrapper(args) {
        const fileNodes = Array.from({ length: 100 }).map((_, index) => ({
            ...args.uiFileNode,
            id: `file-${index}`,
            name: `File ${index} lorem ipsum dolor sit amet consectetur adipiscing elit`,
        }));
        return (
            <div className="flex flex-wrap gap-2">
                {fileNodes.map(node => (
                    <FileItem key={node.id} {...args} uiFileNode={node} />
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
