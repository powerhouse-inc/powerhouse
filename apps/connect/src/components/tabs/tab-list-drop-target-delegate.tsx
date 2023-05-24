import {
    Collection,
    DropTarget,
    DropTargetDelegate,
    Node,
} from '@react-types/shared';
import { RefObject } from 'react';

export class TabListDropTargetDelegate implements DropTargetDelegate {
    private collection: Collection<Node<unknown>>;
    private ref: RefObject<HTMLElement>;

    constructor(
        collection: Collection<Node<unknown>>,
        ref: RefObject<HTMLElement>
    ) {
        this.collection = collection;
        this.ref = ref;
    }

    getDropTargetFromPoint(
        x: number,
        _y: number,
        isValidDropTarget: (target: DropTarget) => boolean
    ): DropTarget {
        if (this.collection.size === 0 || !this.ref.current) {
            return { type: 'root' };
        }

        let rect = this.ref.current.getBoundingClientRect();
        x += rect.x;

        const elements = this.ref.current.querySelectorAll('[data-key]');
        const elementMap = new Map<string, HTMLElement>();
        for (const item of elements) {
            if (item instanceof HTMLElement) {
                elementMap.set(item.dataset.key!, item);
            }
        }

        const items = [...this.collection];
        let low = 0;
        let high = items.length;
        while (low < high) {
            const mid = Math.floor((low + high) / 2);
            const item = items[mid];
            const element = elementMap.get(String(item.key));
            const rect = element!.getBoundingClientRect();

            if (x < rect.right) {
                high = mid;
            } else if (x > rect.left) {
                low = mid + 1;
            } else {
                const target: DropTarget = {
                    type: 'item',
                    key: item.key,
                    dropPosition: 'on',
                };

                if (isValidDropTarget(target)) {
                    // Otherwise, if dropping on the item is accepted, try the before/after positions if within 5px
                    // of the right or left of the item.
                    if (
                        x <= rect.right + 5 &&
                        isValidDropTarget({ ...target, dropPosition: 'before' })
                    ) {
                        target.dropPosition = 'before';
                    } else if (
                        x >= rect.left - 5 &&
                        isValidDropTarget({ ...target, dropPosition: 'after' })
                    ) {
                        target.dropPosition = 'after';
                    }
                } else {
                    // If dropping on the item isn't accepted, try the target before or after depending on the x position.
                    const midY = rect.right + rect.width / 2;
                    if (
                        x <= midY &&
                        isValidDropTarget({ ...target, dropPosition: 'before' })
                    ) {
                        target.dropPosition = 'before';
                    } else if (
                        x >= midY &&
                        isValidDropTarget({ ...target, dropPosition: 'after' })
                    ) {
                        target.dropPosition = 'after';
                    }
                }
                return target;
            }
        }

        const item = items[Math.min(low, items.length - 1)];
        const element = elementMap.get(String(item.key));
        rect = element!.getBoundingClientRect();

        if (Math.abs(x - rect.right) < Math.abs(x - rect.left)) {
            return {
                type: 'item',
                key: item.key,
                dropPosition: 'after',
            };
        }

        return {
            type: 'item',
            key: item.key,
            dropPosition: 'before',
        };
    }
}
