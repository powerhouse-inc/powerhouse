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
import { Tab as StoreTab } from 'src/store/tabs';
import TabButton from './tab-button';

export default function Tab({
    item,
    state,
    dragState,
    dropState,
    onCloseTab,
}: {
    item: Node<StoreTab>;
    state: TabListState<StoreTab>;
    dragState: DraggableCollectionState;
    dropState: DroppableCollectionState;
    onCloseTab: (tab: StoreTab) => void;
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
        <TabButton as="button" item={previewItem} className="opacity-30" />
    ) : undefined;

    ref.current?.addEventListener('contextmenu', () => {
        window.electronAPI?.showTabMenu(
            item.value ? StoreTab.serialize(item.value) : ''
        );
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
            <TabButton
                {...mergeProps(
                    tabProps,
                    // dropProps,
                    dragProps,
                    focusProps
                )}
                as="li"
                className={isSameTab ? 'opacity-10' : ''}
                item={item}
                onCloseTab={onCloseTab}
                ref={ref}
                role="option"
            />
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
        <li {...dropIndicatorProps} className="mr-3" role="option" ref={ref}>
            {props.preview}
        </li>
    );
}
