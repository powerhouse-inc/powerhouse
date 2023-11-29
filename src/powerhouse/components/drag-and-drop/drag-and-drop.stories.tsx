import { useDraggableTarget } from '@/powerhouse';
import { action } from '@storybook/addon-actions';
import type { Meta, StoryObj } from '@storybook/react';
import { Draggable } from './draggable';
import { DraggableTarget } from './draggable-target';
import { DropTarget } from './drop-target';

const meta = {
    title: 'Powerhouse/Components/DragAndDrop',
    component: DropTarget,
    argTypes: {
        id: { control: { type: 'text' } },
    },
} satisfies Meta<typeof DropTarget>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Partial<Story> = {
    render: () => (
        <div>
            <Draggable item={{ id: 'item-1', name: 'Item 1' }}>
                {({ isDragging }) => (
                    <div
                        style={{
                            width: 80,
                            height: 30,
                            textAlign: 'center',
                            border: '1px solid black',
                            backgroundColor: isDragging ? 'red' : 'blue',
                        }}
                    >
                        Drag me!
                    </div>
                )}
            </Draggable>
            <div
                style={{
                    display: 'flex',
                    width: 400,
                    height: 400,
                    border: '1px solid black',
                }}
            >
                <DropTarget
                    target={{ id: 'parent', name: 'Parent' }}
                    onDropEvent={action('onDropEvent')}
                    style={{
                        width: '100%',
                        height: '100%',
                    }}
                >
                    {({ isDropTarget }) => (
                        <div
                            style={{
                                display: 'flex',
                                justifyContent: 'center',
                                alignItems: 'center',
                                width: '100%',
                                height: '100%',
                                backgroundColor: isDropTarget
                                    ? 'yellow'
                                    : 'lightblue',
                            }}
                        >
                            <div
                                style={{
                                    width: '200px',
                                    height: '200px',
                                    border: '1px solid black',
                                }}
                            >
                                <DropTarget
                                    target={{ id: 'child', name: 'Child' }}
                                    onDropEvent={action('onDropEvent')}
                                    style={{ width: '100%', height: '100%' }}
                                >
                                    {({ isDropTarget }) => (
                                        <div
                                            style={{
                                                display: 'flex',
                                                justifyContent: 'center',
                                                alignItems: 'center',
                                                width: '100%',
                                                height: '100%',
                                                backgroundColor: isDropTarget
                                                    ? 'yellow'
                                                    : 'lightblue',
                                            }}
                                        />
                                    )}
                                </DropTarget>
                            </div>
                        </div>
                    )}
                </DropTarget>
            </div>
        </div>
    ),
};

type ItemType = {
    id: string;
    name: string;
};

type ItemListType = ItemType & {
    children?: ItemListType[];
};

const listItems: ItemListType[] = [
    {
        id: 'item-1',
        name: 'Item 1',
        children: [
            {
                id: 'item-1-1',
                name: 'Item 1-1',
            },
            {
                id: 'item-1-2',
                name: 'Item 1-2',
                children: [
                    {
                        id: 'item-1-2-1',
                        name: 'Item 1-2-1',
                    },
                ],
            },
        ],
    },
    {
        id: 'item-2',
        name: 'Item 2',
        children: [
            {
                id: 'item-2-1',
                name: 'Item 2-1',
            },
            {
                id: 'item-2-2',
                name: 'Item 2-2',
            },
        ],
    },
    {
        id: 'item-3',
        name: 'Item 3',
    },
    {
        id: 'item-4',
        name: 'Item 4',
    },
    {
        id: 'item-5',
        name: 'Item 5',
    },
];

const ListItems = () => {
    const renderItem = (item: ItemListType) => (
        <DraggableTarget<ItemListType>
            key={item.id}
            item={item}
            onDropEvent={action('onDropEvent')}
        >
            {({ isDropTarget }) => (
                <div
                    style={{
                        margin: 12,
                        padding: 12,
                        border: '1px solid black',
                        backgroundColor: isDropTarget ? 'lightblue' : 'white',
                    }}
                >
                    <div>{item.name}</div>
                    {item.children && (
                        <div>
                            {item.children.map(child => renderItem(child))}
                        </div>
                    )}
                </div>
            )}
        </DraggableTarget>
    );

    return <div>{listItems.map(item => renderItem(item))}</div>;
};

export const DraggableTargetComponent: Partial<Story> = {
    name: 'DraggableTarget',
    render: () => <ListItems />,
};

const DraggableElement: React.FC<ItemType> = props => {
    const { dragProps, dropProps, isDropTarget } = useDraggableTarget<ItemType>(
        {
            data: {
                id: props.id,
                name: props.name,
            },
            onDropEvent: action('onDropEvent'),
        },
    );

    return (
        <div
            {...dragProps}
            {...dropProps}
            onClick={action('onClick')}
            style={{
                backgroundColor: isDropTarget ? 'yellow' : 'lightblue',
                width: '60px',
                height: '30px',
            }}
        >
            {props.name}
        </div>
    );
};

export const UseDraggableTargetHook: Partial<Story> = {
    name: 'useDraggableTarget',
    render: () => (
        <div>
            <DraggableElement id="item-1" name="Item 1" />
            <DraggableElement id="item-2" name="Item 2" />
            <DraggableElement id="item-3" name="Item 3" />
        </div>
    ),
};
