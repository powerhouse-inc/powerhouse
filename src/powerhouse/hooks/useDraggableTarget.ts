/* eslint-disable @typescript-eslint/no-misused-promises */
import { useRef } from 'react';
import {
    DropEvent,
    FileDropItem,
    TextDropItem,
    useDrag,
    useDrop,
} from 'react-aria';
import { CUSTOM_OBJECT_FORMAT } from '../components/drag-and-drop/constants';

export interface CustomObjectDropItem<T = unknown> {
    kind: 'object';
    type: string;
    data: T;
    dropAfterItem?: boolean;
    dropBeforeItem?: boolean;
}

export type DropItem<T> = CustomObjectDropItem<T> | FileDropItem;

export interface UseDraggableTargetProps<T = unknown> {
    data: T;
    onDropEvent?: (item: DropItem<T>, target: T, event: DropEvent) => void;
    dataType?: string;
    dropAfterItem?: boolean;
    dropBeforeItem?: boolean;
}

export function useDraggableTarget<T = unknown>(
    props: UseDraggableTargetProps<T>,
) {
    const { data, onDropEvent, dataType, dropAfterItem, dropBeforeItem } =
        props;

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

            const itemFile = e.items.find(item => item.kind === 'file') as
                | FileDropItem
                | undefined;

            if (itemFile) {
                onDropEvent?.(itemFile, data, e);
            }

            if (item) {
                const result = await item.getText(
                    dataType || CUSTOM_OBJECT_FORMAT,
                );
                const dropData = JSON.parse(result) as T;
                const dropEvent: CustomObjectDropItem<T> = {
                    type: dataType || CUSTOM_OBJECT_FORMAT,
                    kind: 'object',
                    data: dropData,
                    dropAfterItem,
                    dropBeforeItem,
                };
                onDropEvent?.(dropEvent, data, e);
            }
        },
    });

    return { dragProps, dropProps, isDropTarget, isDragging };
}
