import { useDrag } from 'react-aria';
import { CUSTOM_OBJECT_FORMAT } from './constants';

export interface DraggableRenderProps {
    isDragging: boolean;
}

export interface DraggableProps<Item = unknown>
    extends Omit<React.HTMLAttributes<HTMLDivElement>, 'children'> {
    children?: (props: DraggableRenderProps) => React.ReactNode;
    item: Item;
    dataType?: string;
}

export function Draggable<Item = unknown>(props: DraggableProps<Item>) {
    const { item, children, dataType, ...divProps } = props;

    const { dragProps, isDragging } = useDrag({
        getItems: () => [
            {
                [dataType || CUSTOM_OBJECT_FORMAT]: JSON.stringify(item),
            },
        ],
    });

    return (
        <>
            {children ? (
                <div {...dragProps} role="button" tabIndex={0} {...divProps}>
                    {children({ isDragging })}
                </div>
            ) : null}
        </>
    );
}
