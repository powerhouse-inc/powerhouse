import { Draggable, DraggableRenderProps } from './draggable';
import {
    DropTarget,
    DropTargetProps,
    DropTargetRenderProps,
} from './drop-target';

export type DraggableTargetRenderProps = DraggableRenderProps &
    DropTargetRenderProps;

export interface DraggableTargetProps<Item = any> {
    item: Item;
    onDropEvent: DropTargetProps<Item, Item>['onDropEvent'];
    children: (props: DraggableTargetRenderProps) => React.ReactNode;
    dragNodeProps?: Omit<React.HTMLAttributes<HTMLDivElement>, 'children'>;
    targetNodeProps?: Omit<React.HTMLAttributes<HTMLDivElement>, 'children'>;
}

export function DraggableTarget<Item = any>(props: DraggableTargetProps<Item>) {
    const {
        item,
        onDropEvent,
        children,
        dragNodeProps = {},
        targetNodeProps = {},
    } = props;

    return (
        <DropTarget<Item, Item>
            onDropEvent={onDropEvent}
            target={item}
            {...targetNodeProps}
        >
            {({ isDropTarget }) => (
                <Draggable<Item> item={item} {...dragNodeProps}>
                    {({ isDragging }) => children({ isDropTarget, isDragging })}
                </Draggable>
            )}
        </DropTarget>
    );
}
