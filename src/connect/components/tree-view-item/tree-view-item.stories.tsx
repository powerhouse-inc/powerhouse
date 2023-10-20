import type { Meta, StoryObj } from '@storybook/react';
import { ConnectTreeViewItem, ItemStatus, ItemType } from './tree-view-item';

const meta = {
    title: 'Connect/Components',
    component: ConnectTreeViewItem,
    argTypes: {
        onClick: { control: { type: 'action' } },
        onOptionsClick: { control: { type: 'action' } },
        buttonProps: { control: { type: 'object' } },
        optionsButtonProps: { control: { type: 'object' } },
        level: { control: { type: 'number' } },
        item: { control: { type: 'object' } },
    },
} satisfies Meta<typeof ConnectTreeViewItem>;

export default meta;
type Story = StoryObj<typeof meta>;

export const TreeViewItem: Story = {
    args: {
        level: 0,
        item: {
            id: 'drive/folder1',
            label: 'Folder 1',
            type: ItemType.Folder,
            status: ItemStatus.Syncing,
            expanded: false,
        },
    },
};
