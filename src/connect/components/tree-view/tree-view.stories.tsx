import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { ActionType, ItemType, TreeItem } from '../tree-view-item';
import { ConnectTreeView, ConnectTreeViewProps } from './tree-view';
import { ItemsContextProvider, useItemsContext } from '@/connect/context/ItemsContext';
import { generateMockDriveData } from '@/connect/utils/mocks/tree-item';

const treeItems = generateMockDriveData({
    path: 'drive',
    label: 'Local Drive',
    type: ItemType.LocalDrive,
    expanded: false,
    isSelected: false,
});

const meta: Meta<typeof ConnectTreeView> = {
    title: 'Connect/Components/TreeView',
    component: ConnectTreeView,
    decorators: [
        Story => (
            <ItemsContextProvider items={treeItems}>
                <Story />
            </ItemsContextProvider>
        ),
    ],
    argTypes: {
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
};

export default meta;
type Story = StoryObj<typeof meta>;

const TreeViewImpl = (args: ConnectTreeViewProps) => {
    const {
        onItemClick,
        onItemOptionsClick,
        onCancelInput,
        onSubmitInput,
        onDropActivate,
        onDragStart,
        onDragEnd,
        ...treeViewProps
    } = args;
    const [disableHighlight, setDisableHighlight] = useState(false);
    const { setItems } = useItemsContext();

    const onItemClickHandler: ConnectTreeViewProps['onItemClick'] = (
        e,
        item,
    ) => {
        onItemClick?.(e, item);
        setItems((itemsContext) => itemsContext.map((itemContext) => {
            const newItem = { ...itemContext };
            if (newItem.id === item.id) {
                newItem.isSelected = true;
                newItem.expanded = !itemContext.expanded;
            } else {
                newItem.isSelected = false;
            }

            return newItem;
        }));
    };

    const onItemOptionsClickHandler: ConnectTreeViewProps['onItemOptionsClick'] =
        (item, option) => {
            onItemOptionsClick?.(item, option);

            if (option === 'rename') {
                setItems((prevItems) => prevItems.map((prevItem) => {
                    const newItem = { ...prevItem };

                    if (prevItem.id === item.id) {
                        newItem.action = ActionType.Update;
                    } else {
                        newItem.action = undefined;
                        newItem.isSelected = false;
                    }

                    return newItem;
                }));

                return;
            }

            if (option === 'new-folder') {
                setItems((prevItems) => {
                    const newItems = prevItems.map((prevItem) => {
                        if (prevItem.id === item.id) {
                            return { ...prevItem, expanded: true, isSelected: false };
                        }
                        return prevItem;
                    });

                    return [
                        ...newItems,
                        {
                            id: `${item.id}/new-folder`,
                            path: `${item.path}/new-folder`,
                            label: 'New Folder',
                            type: ItemType.Folder,
                            action: ActionType.New,
                        },
                    ];
                });
            }
        };

    const onCancelInputHandler: ConnectTreeViewProps['onCancelInput'] =
        item => {
            onCancelInput?.(item);
            setItems((prevItems) => {
                const newItems = prevItems.reduce<TreeItem[]>((acc, prevItem) => {
                    if (prevItem.action === ActionType.New) return acc;
                    if (prevItem.action === ActionType.Update) {
                        return [...acc, { ...prevItem, action: undefined }];
                    }
                    return [...acc, prevItem];
                }, []);

                return newItems;
            });
        };

    const onSubmitInputHandler: ConnectTreeViewProps['onSubmitInput'] =
        item => {
            onSubmitInput?.(item);
            setItems((prevItems) => prevItems.map((prevItem) => {
                if (prevItem.id === item.id) {
                    return { ...prevItem, ...item, action: undefined };
                }

                return prevItem;
            }));
        };

    const onDropActivateHandler: ConnectTreeViewProps['onDropActivate'] =
        item => {
            onDropActivate?.(item);
            setItems((prevItems) => prevItems.map((prevItem) => {
                if (item.id === prevItem.id) {
                    return {...prevItem, expanded: true};
                }
                return prevItem;
            }));
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
        <div className="bg-white p-10">
            <ConnectTreeView
                onItemClick={onItemClickHandler}
                onCancelInput={onCancelInputHandler}
                onSubmitInput={onSubmitInputHandler}
                onItemOptionsClick={onItemOptionsClickHandler}
                onDropActivate={onDropActivateHandler}
                disableHighlightStyles={disableHighlight}
                onDragStart={onDragStartHandler}
                onDragEnd={onDragEndHandler}
                filterPath='drive'
                {...treeViewProps}
            />
        </div>
    );
};

export const TreeView: Partial<Story> = {
    render: args => <TreeViewImpl {...args} />,
};
