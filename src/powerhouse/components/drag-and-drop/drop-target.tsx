/* eslint-disable @typescript-eslint/no-misused-promises */
import { useRef } from 'react';
import { DropEvent, TextDropItem, useDrop } from 'react-aria';

import { CUSTOM_OBJECT_FORMAT } from './constants';

export interface DropTargetRenderProps {
    isDropTarget: boolean;
}

export interface DropTargetProps<Target = any, Item = any>
    extends Omit<React.HTMLAttributes<HTMLDivElement>, 'children'> {
    target: Target;
    children?: (props: DropTargetRenderProps) => React.ReactNode;
    onDropEvent: (item: Item, target: Target, event: DropEvent) => void;
}

export function DropTarget<Target = any, Item = any>(
    props: DropTargetProps<Target, Item>,
) {
    const { children, target, onDropEvent, ...divProps } = props;

    if (!children) return null;

    const ref = useRef(null);
    const { dropProps, isDropTarget } = useDrop({
        ref,
        async onDrop(e) {
            const item = e.items.find(
                item =>
                    item.kind === 'text' &&
                    item.types.has(CUSTOM_OBJECT_FORMAT),
            ) as TextDropItem | undefined;

            if (item) {
                const result = await item.getText(CUSTOM_OBJECT_FORMAT);
                onDropEvent(JSON.parse(result) as Item, target, e);
            }
        },
    });

    return (
        <div {...divProps} {...dropProps} ref={ref}>
            {children({ isDropTarget })}
        </div>
    );
}
