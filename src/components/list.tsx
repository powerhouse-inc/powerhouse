import { ReactElement, ReactNode, useRef } from 'react';
import {
    DragPreview,
    DropIndicatorProps,
    ListKeyboardDelegate,
    mergeProps,
    useDraggableCollection,
    useDraggableItem,
    useDropIndicator,
    useDroppableCollection,
    useFocusRing,
    useTab,
    useTabList,
    useTabPanel,
} from 'react-aria';
import { Tabs } from 'react-aria-components';
import type {
    DraggableCollectionState,
    DroppableCollectionState,
    DroppableCollectionStateOptions,
    Node,
    TabListState,
} from 'react-stately';
import {
    useDraggableCollectionState,
    useDroppableCollectionState,
    useTabListState,
} from 'react-stately';
import { TabListDropTargetDelegate } from './TabListDropTargetDelegate';

export function ReorderableTabList(
    props: { children: ReactElement } & DroppableCollectionStateOptions &
        Parameters<typeof useTabList>[0]
) {
    // Setup listbox as normal. See the useListBox docs for more details.
    const state = useTabListState(props as any);
    const preview = useRef(null);
    const ref = useRef(null);
    const { tabListProps } = useTabList(
        {
            ...props,
            selectedKey: 2,
            orientation: 'horizontal',
        },
        state,
        ref
    );
    // Setup drag state for the collection.
    const dragState = useDraggableCollectionState({
        // Pass through events from props.
        ...props,
        // Collection and selection manager come from list state.
        collection: state.collection,
        selectionManager: state.selectionManager,
        preview,
        // Provide data for each dragged item. This function could
        // also be provided by the user of the component.
        getItems: keys => {
            return [...keys].map(key => {
                const item = state.collection.getItem(key);
                return {
                    'text/plain': item?.textValue ?? '',
                    key: key.toString(),
                };
            });
        },
    });

    useDraggableCollection(props, dragState, ref);

    // Setup react-stately and react-aria hooks for dropping.
    const dropState = useDroppableCollectionState({
        ...props,
        collection: state.collection,
        selectionManager: state.selectionManager,
    });

    const isDropTarget = dropState.isDropTarget({ type: 'root' });

    const { collectionProps } = useDroppableCollection(
        {
            ...props,
            // Provide drop targets for keyboard and pointer-based drag and drop.
            keyboardDelegate: new ListKeyboardDelegate(
                state.collection,
                state.disabledKeys,
                ref
            ),
            dropTargetDelegate: new TabListDropTargetDelegate(
                state.collection,
                ref
            ),
        },
        dropState,
        ref
    );

    return (
        <Tabs orientation="horizontal">
            <ul
                {...mergeProps(tabListProps, collectionProps)}
                ref={ref}
                className={`flex pb-4 ${
                    isDropTarget && 'bg-light'
                } rounded-3xl`}
            >
                {[...state.collection].map(item => (
                    <Option
                        key={item.key}
                        item={item}
                        state={state}
                        dragState={dragState}
                        dropState={dropState}
                    />
                ))}
                <DragPreview ref={preview}>
                    {items => (
                        <div className="min-w-36 mr-4 cursor-grabbing overflow-hidden text-ellipsis whitespace-nowrap rounded-3xl bg-light px-6 py-4">
                            {items.length > 1
                                ? `${items.length} items`
                                : items[0]['text/plain']}
                        </div>
                    )}
                </DragPreview>
            </ul>
            <hr className="mb-6" />
            <TabPanel key={state.selectedItem?.key} state={state} />
        </Tabs>
    );
}

function TabPanel({
    state,
    ...props
}: Parameters<typeof useTabList>[0] & {
    state: Parameters<typeof useTabList>[1];
}) {
    const ref = useRef(null);
    const { tabPanelProps } = useTabPanel(props, state, ref);
    return (
        <div {...tabPanelProps} ref={ref}>
            {state.selectedItem?.props.children}
        </div>
    );
}

function Option({
    item,
    state,
    dragState,
    dropState,
}: {
    item: Node<object>;
    state: TabListState<object>;
    dragState: DraggableCollectionState;
    dropState: DroppableCollectionState;
}) {
    const ref = useRef(null);
    const { tabProps } = useTab({ key: item.key }, state, ref);
    const { isFocusVisible, focusProps } = useFocusRing();

    // Register the item as a drag source.
    const { dragProps } = useDraggableItem(
        {
            key: item.key,
        },
        dragState
    );

    // const isDropTarget =
    //     dropState.isDropTarget({
    //         key: item.key,
    //         type: 'item',
    //         dropPosition: 'before',
    //     }) ||
    //     dropState.isDropTarget({
    //         key: item.key,
    //         type: 'item',
    //         dropPosition: 'after',
    //     });
    const isDropTarget = false;

    const isSameTab = dragState.draggedKey === item.key;

    const isNextTab =
        dragState.draggedKey === state.collection.getKeyBefore(item.key);

    const previewItem = dragState.draggedKey
        ? state.collection.getItem(dragState.draggedKey)
        : null;
    const previewElement = previewItem ? (
        <div className="min-w-36 cursor-grabbing overflow-hidden text-ellipsis whitespace-nowrap rounded-3xl bg-light px-6 py-4 opacity-30">
            {previewItem.rendered}
        </div>
    ) : undefined;

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
                className={`${
                    isSameTab && 'opacity-10'
                } min-w-36 mx-2 cursor-pointer overflow-hidden
                 text-ellipsis whitespace-nowrap rounded-3xl
                 px-6 py-4 aria-selected:font-bold
                 ${isDropTarget ? 'bg-gray-500' : 'bg-light'}`}
                role="option"
            >
                {item.rendered}
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
    const { dropIndicatorProps, isHidden, isDropTarget } = useDropIndicator(
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
