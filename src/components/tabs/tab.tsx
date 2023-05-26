import { Node } from '@react-types/shared';
import { ReactNode, useRef } from 'react';
import {
    DropIndicatorProps,
    mergeProps,
    useDraggableItem,
    useDropIndicator,
    useFocusRing,
    useTab,
} from 'react-aria';
import {
    DraggableCollectionState,
    DroppableCollectionState,
    TabListState,
} from 'react-stately';
import { ReactComponent as IconCross } from '../../../assets/icons/cross.svg';
import { Tab } from '../../store/tabs';

export default function ({
    item,
    state,
    dragState,
    dropState,
    onCloseTab,
}: {
    item: Node<Tab>;
    state: TabListState<Tab>;
    dragState: DraggableCollectionState;
    dropState: DroppableCollectionState;
    onCloseTab: (tab: Tab) => void;
}) {
    const ref = useRef<HTMLLIElement>(null);
    const { tabProps } = useTab({ key: item.key }, state, ref);
    const { focusProps } = useFocusRing();

    // Register the item as a drag source.
    const { dragProps } = useDraggableItem(
        {
            key: item.key,
        },
        dragState
    );

    const isSameTab = dragState.draggedKey === item.key;

    const isNextTab =
        dragState.draggedKey === state.collection.getKeyBefore(item.key);

    const previewItem = dragState.draggedKey
        ? state.collection.getItem(dragState.draggedKey)
        : null;
    const previewElement = previewItem ? (
        <div className="min-w-36 flex cursor-grabbing items-center overflow-hidden text-ellipsis whitespace-nowrap rounded-t-xl bg-accent-2 px-2 py-[6.5px] opacity-30">
            {previewItem.rendered}
            <div className="ml-2 flex h-[21px] w-[21px] items-center justify-center rounded-full">
                <IconCross className="rotate-45" />
            </div>
        </div>
    ) : undefined;

    ref.current?.addEventListener('contextmenu', () => {
        window.electronAPI?.showTabMenu(item.value?.serialize() ?? '');
    });

    return (
        <>
            {!(isSameTab || isNextTab) && (
                <DropIndicator
                    target={{
                        type: 'item',
                        key: item.key,
                        dropPosition: 'before',
                    }}
                    dropState={dropState}
                    preview={previewElement}
                />
            )}
            <li
                {...mergeProps(
                    tabProps,
                    // dropProps,
                    dragProps,
                    focusProps
                )}
                ref={ref}
                className={`
                ${isSameTab && 'opacity-10'}
                 min-w-36
                 mr-1 flex cursor-pointer items-center justify-between
                 overflow-hidden text-ellipsis whitespace-nowrap rounded-t-xl
                 bg-accent-1 px-2 py-[6.5px] text-neutral-4/50 outline-none hover:bg-accent-2 aria-selected:bg-accent-2`}
                role="option"
            >
                <span>{item.rendered}</span>
                <div
                    className="ml-2 flex h-[21px] w-[21px] items-center justify-center rounded-full hover:bg-neutral-6"
                    onClick={() => item.value && onCloseTab(item.value)}
                >
                    <IconCross className="rotate-45" />
                </div>
            </li>
            {!isSameTab && state.collection.getKeyAfter(item.key) == null && (
                <DropIndicator
                    target={{
                        type: 'item',
                        key: item.key,
                        dropPosition: 'after',
                    }}
                    dropState={dropState}
                    preview={previewElement}
                />
            )}
        </>
    );
}

function DropIndicator(
    props: { dropState: DroppableCollectionState } & DropIndicatorProps & {
            preview?: ReactNode;
        }
) {
    const ref = useRef(null);
    const { dropIndicatorProps, isHidden } = useDropIndicator(
        props,
        props.dropState,
        ref
    );
    if (isHidden) {
        return null;
    }

    return (
        <li {...dropIndicatorProps} role="option" ref={ref}>
            {props.preview}
        </li>
    );
}
