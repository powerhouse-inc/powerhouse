import { SUCCESS } from '@/connect';
import type { Meta, StoryObj } from '@storybook/react';
import { ConnectTreeViewItem } from '.';

const meta: Meta<typeof ConnectTreeViewItem> = {
    title: 'Connect/Components/TreeView',
    component: ConnectTreeViewItem,
    decorators: [
        Story => (
            <div className="bg-white p-10">
                <Story />
            </div>
        ),
    ],
    argTypes: {
        onClick: { control: { type: 'action' } },
        onOptionsClick: { control: { type: 'action' } },
        level: { control: { type: 'number' } },
        item: { control: { type: 'object' } },
        defaultOptions: { control: { type: 'object' } },
        onDropEvent: { control: { type: 'action' } },
        onDropActivate: { control: { type: 'action' } },
    },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const TreeViewItem: Story = {
    args: {
        level: 0,
        item: {
            id: 'drive/folder1',
            path: 'drive/folder1',
            label: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua',
            type: 'FOLDER',
            expanded: false,
            isSelected: false,
            availableOffline: false,
            syncStatus: SUCCESS,
        },
    },
};
