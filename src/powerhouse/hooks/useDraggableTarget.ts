/* eslint-disable @typescript-eslint/no-misused-promises */
import { useRef } from 'react';
import { DropEvent, TextDropItem, useDrag, useDrop } from 'react-aria';
import { CUSTOM_OBJECT_FORMAT } from '../components/drag-and-drop/constants';

export interface UseDraggableTargetProps<T = unknown> {
    data: T;
    onDropEvent?: (item: T, target: T, event: DropEvent) => void;
    dataType?: string;
}

export function useDraggableTarget<T = unknown>(
    props: UseDraggableTargetProps<T>,
) {
    const { data, onDropEvent, dataType } = props;

    const ref = useRef(null);

    const { dragProps, isDragging } = useDrag({
        getItems: () => [
            {
                [dataType || CUSTOM_OBJECT_FORMAT]: JSON.stringify(data),
            },
        ],
    });

    const { dropProps, isDropTarget } = useDrop({
        ref,
        async onDrop(e) {
            const item = e.items.find(
                item =>
                    item.kind === 'text' &&
                    item.types.has(dataType || CUSTOM_OBJECT_FORMAT),
            ) as TextDropItem | undefined;

            if (item) {
                const result = await item.getText(
                    dataType || CUSTOM_OBJECT_FORMAT,
                );
                onDropEvent?.(JSON.parse(result) as T, data, e);
            }
        },
    });

    return { dragProps, dropProps, isDropTarget, isDragging };
}
