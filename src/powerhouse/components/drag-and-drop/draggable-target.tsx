import { Draggable, DraggableRenderProps } from './draggable';
import {
    DropTarget,
    DropTargetProps,
    DropTargetRenderProps,
} from './drop-target';

export type DraggableTargetRenderProps = DraggableRenderProps &
    DropTargetRenderProps;

export interface DraggableTargetProps<Item = unknown> {
    item: Item;
    onDropEvent: DropTargetProps<Item, Item>['onDropEvent'];
    children: (props: DraggableTargetRenderProps) => React.ReactNode;
    dragNodeProps?: Omit<React.HTMLAttributes<HTMLDivElement>, 'children'>;
    targetNodeProps?: Omit<React.HTMLAttributes<HTMLDivElement>, 'children'>;
    dataType?: string;
}

export function DraggableTarget<Item = unknown>(
    props: DraggableTargetProps<Item>,
) {
    const {
        item,
        dataType,
        children,
        onDropEvent,
        dragNodeProps = {},
        targetNodeProps = {},
    } = props;

    return (
        <DropTarget<Item, Item>
            onDropEvent={onDropEvent}
            target={item}
            dataType={dataType}
            {...targetNodeProps}
        >
            {({ isDropTarget }) => (
                <Draggable<Item>
                    item={item}
                    dataType={dataType}
                    {...dragNodeProps}
                >
                    {({ isDragging }) => children({ isDropTarget, isDragging })}
                </Draggable>
            )}
        </DropTarget>
    );
}
