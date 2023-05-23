import { ReactComponent as IconCross } from '@/assets/icons/cross.svg';
import type { TabListStateOptions } from '@react-stately/tabs';
import { useAtomValue } from 'jotai';
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
import { DraggableCollectionEndEvent, Tabs } from 'react-aria-components';
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
import { themeAtom } from '../store';
import { TabListDropTargetDelegate } from './TabListDropTargetDelegate';
import { Tab } from './tabs';

export function ReorderableTabList(
    props: {
        children: ReactElement | ((item: Tab) => Element);
    } & TabListStateOptions<Tab> &
        DroppableCollectionStateOptions & {
            onDragOut?: (key: DraggableCollectionEndEvent) => void;
        } & {
            onCloseTab: (tab: Tab) => void;
            onNewTab: () => void;
        }
) {
    // Setup listbox as normal. See the useListBox docs for more details.
    const state = useTabListState<Tab>(props);
    const preview = useRef(null);
    const ref = useRef(null);
    const { tabListProps } = useTabList(
        {
            ...props,
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
                const test = {
                    'text/plain': item?.value?.name ?? '',
                    key: key.toString(),
                    id: item?.value?.name ?? '',
                    name: item?.value?.name ?? '',
                    type: item?.value?.type ?? '',
                    args: item?.value?.serialize() ?? '[]',
                };
                return test;
            });
        },
        onDragEnd(e) {
            if (e.isInternal) {
                return true;
            }

            props.onDragOut?.(e);
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

    const theme = useAtomValue(themeAtom);

    return (
        <Tabs orientation="horizontal" className="flex h-full flex-col">
            <ul
                {...mergeProps(tabListProps, collectionProps)}
                ref={ref}
                className={`flex items-center ${
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
                        onCloseTab={props.onCloseTab}
                    />
                ))}
                <button
                    className={`ml-3 flex h-6 w-6 items-center justify-center rounded-full hover:bg-accent-2
                        ${theme === 'dark' && 'bg-neutral-6'}
                    `}
                    onClick={() => props.onNewTab()}
                >
                    <IconCross />
                </button>
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
            <TabPanel key={state.selectedItem?.key} state={state} />
        </Tabs>
    );
}

function TabPanel({
    state,
    ...props
}: Parameters<typeof useTabList>[0] & {
    state: TabListState<Tab>;
}) {
    const ref = useRef(null);
    const { tabPanelProps } = useTabPanel(props, state, ref);
    return (
        <div
            className="min-h-full flex-1 bg-accent-2"
            {...tabPanelProps}
            ref={ref}
        >
            {state.selectedItem?.value?.content}
        </div>
    );
}

function Option({
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
                    className="onClick={() => item.value && onCloseTab(item.value)} ml-2 flex h-[21px] w-[21px] items-center justify-center rounded-full hover:bg-neutral-6"
                    onClick={() => item.value && onCloseTab(item.value)}
                >
                    <IconCross className="bg-red" />
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
