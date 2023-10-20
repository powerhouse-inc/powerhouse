import type { Meta, StoryObj } from '@storybook/react';
import { ConnectTreeViewItem, ItemStatus, ItemType } from './tree-view-item';

const meta = {
    title: 'Connect/Components',
    component: ConnectTreeViewItem,
    argTypes: {
        onClick: { control: { type: 'action' } },
        onOptionsClick: { control: { type: 'action' } },
        initialOpen: { control: { type: 'boolean' } },
        buttonProps: { control: { type: 'object' } },
        optionsButtonProps: { control: { type: 'object' } },
        level: { control: { type: 'number' } },
        status: {
            control: { type: 'select' },
            options: ['available', 'available-offline', 'syncing', 'offline'],
        },
        type: {
            control: { type: 'select' },
            options: [
                'folder',
                'file',
                'local-drive',
                'network-drive',
                'public-drive',
            ],
        },
    },
} satisfies Meta<typeof ConnectTreeViewItem>;

export default meta;
type Story = StoryObj<typeof meta>;

export const TreeViewItem: Story = {
    args: {
        label: 'Folder 1',
        status: 'syncing' as ItemStatus,
        type: 'folder' as ItemType,
        level: 0,
    },
};
