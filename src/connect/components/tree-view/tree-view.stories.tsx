import { traverseTree } from '@/connect/utils';
import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { ItemStatus, ItemType, TreeItem } from '../tree-view-item';
import { ConnectTreeView, ConnectTreeViewProps } from './tree-view';

const meta = {
    title: 'Connect/Components/TreeView',
    component: ConnectTreeView,
    argTypes: {
        items: { control: { type: 'object' } },
        onItemClick: { control: { type: 'action' } },
        onDropEvent: { control: { type: 'action' } },
        onItemOptionsClick: { control: { type: 'action' } },
        defaultItemOptions: { control: { type: 'object' } },
    },
} satisfies Meta<typeof ConnectTreeView>;

export default meta;
type Story = StoryObj<typeof meta>;

const treeItem: TreeItem = {
    id: 'drive',
    label: 'Local Drive',
    type: ItemType.LocalDrive,
    expanded: false,
    isSelected: false,
    children: [
        {
            id: 'drive/folder1',
            label: 'Folder 1',
            type: ItemType.Folder,
            status: ItemStatus.Syncing,
            expanded: false,
            isSelected: false,
            children: [
                {
                    id: 'drive/folder1/folder1.1',
                    label: 'Folder 1.1',
                    type: ItemType.Folder,
                    status: ItemStatus.Syncing,
                    expanded: false,
                    isSelected: false,
                },
                {
                    id: 'drive/folder1/folder1.2',
                    label: 'Folder 1.2',
                    type: ItemType.Folder,
                    status: ItemStatus.Syncing,
                    expanded: false,
                    isSelected: false,
                    children: [
                        {
                            id: 'drive/folder1/folder1.2/folder1.2.1',
                            label: 'Folder 1.2.1',
                            type: ItemType.Folder,
                            status: ItemStatus.Syncing,
                            expanded: false,
                            isSelected: false,
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
            isSelected: false,
            children: [
                {
                    id: 'drive/folder2/folder2.1',
                    label: 'Folder 2.1',
                    type: ItemType.Folder,
                    status: ItemStatus.AvailableOffline,
                    expanded: false,
                    isSelected: false,
                },
            ],
        },
        {
            id: 'drive/folder3',
            label: 'Folder 3',
            type: ItemType.Folder,
            status: ItemStatus.Offline,
            expanded: false,
            isSelected: false,
        },
    ],
};

const TreeViewImpl = (args: ConnectTreeViewProps) => {
    const { onItemClick, items: argItems, ...treeViewProps } = args;
    const [items, setItems] = useState(argItems);

    const onItemClickHandler: ConnectTreeViewProps['onItemClick'] = (
        e,
        item,
    ) => {
        onItemClick?.(e, item);
        setItems(prevState => {
            const newTree = traverseTree(prevState, treeItem => {
                if (treeItem.id === item.id) {
                    treeItem.isSelected = !treeItem.isSelected;
                    treeItem.expanded = !treeItem.expanded;
                } else {
                    treeItem.isSelected = false;
                }

                return treeItem;
            });

            return newTree;
        });
    };

    return (
        <div className="p-10 bg-white">
            <ConnectTreeView
                items={items}
                onItemClick={onItemClickHandler}
                {...treeViewProps}
            />
        </div>
    );
};

export const TreeView: Story = {
    args: {
        items: treeItem,
    },
    render: args => <TreeViewImpl {...args} />,
};
