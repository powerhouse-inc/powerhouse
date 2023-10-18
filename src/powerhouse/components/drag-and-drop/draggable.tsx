import { useDrag } from 'react-aria';
import { CUSTOM_OBJECT_FORMAT } from './constants';

export interface DraggableRenderProps {
    isDragging: boolean;
}

export interface DraggableProps<Item = any>
    extends Omit<React.HTMLAttributes<HTMLDivElement>, 'children'> {
    children?: (props: DraggableRenderProps) => React.ReactNode;
    item: Item;
}

export function Draggable<Item = any>(props: DraggableProps<Item>) {
    const { item, children, ...divProps } = props;

    if (!children) return null;

    const { dragProps, isDragging } = useDrag({
        getItems: () => [
            {
                [CUSTOM_OBJECT_FORMAT]: JSON.stringify(item),
            },
        ],
    });

    return (
        <div {...dragProps} {...divProps}>
            {children({ isDragging })}
        </div>
    );
}
