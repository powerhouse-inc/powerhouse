import { traverseTree } from '@/connect/utils';
import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { ActionType, ItemStatus, ItemType, TreeItem } from '../tree-view-item';
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
        onSubmitInput: { control: { type: 'action' } },
        onCancelInput: { control: { type: 'action' } },
        onDropActivate: { control: { type: 'action' } },
        onDragStart: { control: { type: 'action' } },
        onDragEnd: { control: { type: 'action' } },
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
    const {
        onItemClick,
        items: argItems,
        onItemOptionsClick,
        onCancelInput,
        onSubmitInput,
        onDropActivate,
        onDragStart,
        onDragEnd,
        ...treeViewProps
    } = args;
    const [items, setItems] = useState(argItems);
    const [disableHighlight, setDisableHighlight] = useState(false);

    const onItemClickHandler: ConnectTreeViewProps['onItemClick'] = (
        e,
        item,
    ) => {
        onItemClick?.(e, item);
        setItems(prevState => {
            const newTree = traverseTree(prevState, treeItem => {
                if (treeItem.id === item.id) {
                    treeItem.isSelected = true;
                    treeItem.expanded = !treeItem.expanded;
                } else {
                    treeItem.isSelected = false;
                }

                return treeItem;
            });

            return newTree;
        });
    };

    const onItemOptionsClickHandler: ConnectTreeViewProps['onItemOptionsClick'] =
        (item, option) => {
            onItemOptionsClick?.(item, option);

            if (option === 'rename') {
                const newTree = traverseTree(items, treeItem => {
                    if (treeItem.id === item.id) {
                        treeItem.action = ActionType.Update;
                    } else {
                        treeItem.action = undefined;
                        treeItem.isSelected = false;
                    }

                    return treeItem;
                });

                setItems(newTree);
                return;
            }

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
                        });
                    }

                    return treeItem;
                });

                setItems(newTree);
            }
        };

    const onCancelInputHandler: ConnectTreeViewProps['onCancelInput'] =
        item => {
            onCancelInput?.(item);
            const newTree = traverseTree(items, treeItem => {
                if (treeItem.id === item.id) {
                    treeItem.action = undefined;
                }

                return treeItem;
            });

            setItems(newTree);
        };

    const onSubmitInputHandler: ConnectTreeViewProps['onSubmitInput'] =
        item => {
            onSubmitInput?.(item);
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

    const onDropActivateHandler: ConnectTreeViewProps['onDropActivate'] =
        item => {
            onDropActivate?.(item);

            setItems(prevState => {
                const newTree = traverseTree(prevState, treeItem => {
                    if (treeItem.id === item.id) {
                        treeItem.expanded = true;
                    }

                    return treeItem;
                });

                return newTree;
            });
        };

    const onDragStartHandler: ConnectTreeViewProps['onDragStart'] = (
        item,
        event,
    ) => {
        onDragStart?.(item, event);
        setDisableHighlight(true);
    };

    const onDragEndHandler: ConnectTreeViewProps['onDragEnd'] = (
        item,
        event,
    ) => {
        onDragEnd?.(item, event);
        setDisableHighlight(false);
    };

    return (
        <div className="p-10 bg-white">
            <ConnectTreeView
                items={items}
                onItemClick={onItemClickHandler}
                onCancelInput={onCancelInputHandler}
                onSubmitInput={onSubmitInputHandler}
                onItemOptionsClick={onItemOptionsClickHandler}
                onDropActivate={onDropActivateHandler}
                disableHighlightStyles={disableHighlight}
                onDragStart={onDragStartHandler}
                onDragEnd={onDragEndHandler}
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
