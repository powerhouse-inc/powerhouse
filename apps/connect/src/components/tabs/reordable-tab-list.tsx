import IconCross from '@/assets/icons/cross.svg?react';
import type { TabListStateOptions } from '@react-stately/tabs';
import { useRef } from 'react';
import {
    DragPreview,
    ListKeyboardDelegate,
    mergeProps,
    useDraggableCollection,
    useDroppableCollection,
    useTabList,
} from 'react-aria';
import { DraggableCollectionEndEvent, Tabs } from 'react-aria-components';
import type { DroppableCollectionStateOptions } from 'react-stately';
import {
    useDraggableCollectionState,
    useDroppableCollectionState,
    useTabListState,
} from 'react-stately';
import { Tab } from 'src/store/tabs';
import TabComponent from './tab';
import TabButton from './tab-button';
import { TabListDropTargetDelegate } from './tab-list-drop-target-delegate';
import TabPanel from './tab-panel';

export function ReorderableTabList(
    props: TabListStateOptions<Tab> &
        Omit<
            DroppableCollectionStateOptions,
            'collection' | 'selectionManager'
        > & {
            onDragOut?: (key: DraggableCollectionEndEvent) => void;
        } & {
            onNewTab: () => void;
            onCloseTab: (tab: Tab) => void;
            onUpdateTab: (tab: Tab) => void;
        },
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
        ref,
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
                    tab: item?.value ? Tab.serialize(item.value) : '',
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
                ref,
            ),
            dropTargetDelegate: new TabListDropTargetDelegate(
                state.collection,
                ref,
            ),
        },
        dropState,
        ref,
    );

    return (
        <Tabs
            orientation="horizontal"
            className="flex h-full flex-col bg-slate-50"
        >
            <ul
                {...mergeProps(tabListProps, collectionProps)}
                ref={ref}
                className={`flex shrink-0 items-center
                ${isDropTarget && 'bg-slate-50'}
                rounded-3xl px-2 pb-4 pt-3`}
            >
                {[...state.collection].map(item => (
                    <TabComponent
                        key={item.key}
                        item={item}
                        state={state}
                        dragState={dragState}
                        dropState={dropState}
                        onCloseTab={props.onCloseTab}
                    />
                ))}
                <button
                    className={`h-10 px-2`}
                    onClick={() => props.onNewTab()}
                >
                    <div className="flex size-6 items-center justify-center rounded-md text-gray-500 hover:bg-slate-100 hover:text-slate-800">
                        <IconCross />
                    </div>
                </button>
                <DragPreview ref={preview}>
                    {items => (
                        <TabButton
                            as="button"
                            item={
                                items.length > 1
                                    ? `${items.length} items`
                                    : items[0]['text/plain']
                            }
                        />
                    )}
                </DragPreview>
            </ul>
            <TabPanel
                key={state.selectedItem.key}
                state={state}
                onUpdateTab={props.onUpdateTab}
            />
        </Tabs>
    );
}
