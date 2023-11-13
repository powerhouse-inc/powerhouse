import { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { Breadcrumbs } from '.';
import { ConnectTreeViewProps } from '..';
import { ActionType, ItemStatus, ItemType, TreeItem } from '../tree-view-item';

const meta = {
    title: 'Connect/Components/Breadcrumbs',
    component: Breadcrumbs,
} satisfies Meta<typeof Breadcrumbs>;

export default meta;

type Story = StoryObj<{
    rootItem: TreeItem;
}>;

const rootItem: TreeItem = {
    id: 'drive',
    label: 'Local Drive',
    type: ItemType.LocalDrive,
    expanded: false,
    isSelected: true,
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
                    isSelected: true,
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

export const Default: Story = {
    args: {
        rootItem,
    },
    render: function Wrapper(args) {
        const [items, setItems] = useState(args.rootItem);

        console.log({ items });

        const traverseTree = (
            item: TreeItem,
            callback: (item: TreeItem) => TreeItem,
        ): TreeItem => {
            const treeItem = callback(item);

            if (treeItem.children) {
                treeItem.children = treeItem.children.map(child =>
                    traverseTree(child, callback),
                );
            }

            return { ...treeItem };
        };

        const onItemClickHandler: ConnectTreeViewProps['onItemClick'] = (
            e,
            item,
        ) => {
            setItems(prevState => {
                const newTree = traverseTree(prevState, treeItem => {
                    if (treeItem.id === item.id) {
                        treeItem.isSelected = !treeItem.isSelected;
                    } else {
                        treeItem.isSelected = false;
                    }

                    return treeItem;
                });

                return newTree;
            });
        };

        const onCancelInputHandler = (item: TreeItem) => {
            const newTree = traverseTree(items, treeItem => {
                if (treeItem.id === item.id) {
                    treeItem.action = undefined;
                }

                return treeItem;
            });

            setItems(newTree);
        };

        const onSubmitInputHandler = (item: TreeItem) => {
            const newTree = traverseTree(items, treeItem => {
                if (treeItem.id === item.id) {
                    treeItem.action = undefined;
                    treeItem.label = item.label;
                    item.id = item.id.replace(
                        /\/new-folder$/,
                        `/${item.label}`,
                    );
                }

                return treeItem;
            });

            setItems(newTree);
        };

        const onItemOptionsClickHandler = (
            item: TreeItem,
            option: 'new-folder',
        ) => {
            if (option === 'new-folder') {
                const newTree = traverseTree(items, treeItem => {
                    if (treeItem.id === item.id) {
                        treeItem.expanded = true;
                        treeItem.isSelected = false;
                        treeItem.children = treeItem.children || [];
                        treeItem.children.push({
                            id: `${treeItem.id}/new-folder`,
                            label: 'New Folder',
                            type: ItemType.Folder,
                            action: ActionType.New,
                            isSelected: true,
                        });
                    }

                    return treeItem;
                });

                setItems(newTree);
            }
        };

        return (
            <div className="p-10 bg-white">
                <Breadcrumbs
                    rootItem={items}
                    onItemClick={onItemClickHandler}
                    onAddNewItem={onItemOptionsClickHandler}
                    onSubmitInput={onSubmitInputHandler}
                    onCancelInput={onCancelInputHandler}
                />
            </div>
        );
    },
};
