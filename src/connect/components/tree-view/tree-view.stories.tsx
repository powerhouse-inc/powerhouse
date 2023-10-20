import type { Meta, StoryObj } from '@storybook/react';
import { ItemStatus, ItemType, TreeItem } from '../tree-view-item';
import { ConnectTreeView } from './tree-view';

const meta = {
    title: 'Connect/Components',
    component: ConnectTreeView,
    argTypes: {
        items: { control: { type: 'object' } },
        onItemClick: { control: { type: 'action' } },
        onDropEvent: { control: { type: 'action' } },
        onItemOptionsClick: { control: { type: 'action' } },
    },
} satisfies Meta<typeof ConnectTreeView>;

export default meta;
type Story = StoryObj<typeof meta>;

const treeItem: TreeItem = {
    id: 'drive',
    label: 'Local Drive',
    type: ItemType.LocalDrive,
    expanded: false,
    children: [
        {
            id: 'drive/folder1',
            label: 'Folder 1',
            type: ItemType.Folder,
            status: ItemStatus.Syncing,
            expanded: false,
            children: [
                {
                    id: 'drive/folder1/folder1.1',
                    label: 'Folder 1.1',
                    type: ItemType.Folder,
                    status: ItemStatus.Syncing,
                    expanded: false,
                },
                {
                    id: 'drive/folder1/folder1.2',
                    label: 'Folder 1.2',
                    type: ItemType.Folder,
                    status: ItemStatus.Syncing,
                    expanded: false,
                    children: [
                        {
                            id: 'drive/folder1/folder1.2/folder1.2.1',
                            label: 'Folder 1.2.1',
                            type: ItemType.Folder,
                            status: ItemStatus.Syncing,
                            expanded: false,
                        },
                    ],
                },
            ],
        },
        {
            id: 'drive/folder2',
            label: 'Folder 2',
            type: ItemType.Folder,
            status: ItemStatus.AvailableOffline,
            expanded: false,
            children: [
                {
                    id: 'drive/folder2/folder2.1',
                    label: 'Folder 2.1',
                    type: ItemType.Folder,
                    status: ItemStatus.AvailableOffline,
                    expanded: false,
                },
            ],
        },
        {
            id: 'drive/folder3',
            label: 'Folder 3',
            type: ItemType.Folder,
            status: ItemStatus.Offline,
            expanded: false,
        },
    ],
};

export const TreeView: Story = {
    args: {
        items: treeItem,
    },
};
