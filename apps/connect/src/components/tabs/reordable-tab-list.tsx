import { ReactComponent as IconCross } from '@/assets/icons/cross.svg';
import type { TabListStateOptions } from '@react-stately/tabs';
import { useAtomValue } from 'jotai';
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
import { themeAtom } from '../../store';
import { Tab } from '../../store/tabs';
import TabComponent from './tab';
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
                    className={`ml-3 flex h-6 w-6 items-center justify-center rounded-full hover:bg-accent-2
                        ${theme === 'dark' && 'bg-neutral-6'}
                    `}
                    onClick={() => props.onNewTab()}
                >
                    <IconCross />
                </button>
                <DragPreview ref={preview}>
                    {items => (
                        <div
                            className="min-w-36 flex cursor-grabbing items-center overflow-hidden
                                text-ellipsis whitespace-nowrap rounded-t-xl bg-accent-2 px-2 py-[6.5px] text-neutral-4/50"
                        >
                            {items.length > 1
                                ? `${items.length} items`
                                : items[0]['text/plain']}
                            <div className="ml-2 flex h-[21px] w-[21px] items-center justify-center rounded-full hover:bg-neutral-6">
                                <IconCross className="rotate-45" />
                            </div>
                        </div>
                    )}
                </DragPreview>
            </ul>
            <TabPanel key={state.selectedItem?.key} state={state} />
        </Tabs>
    );
}
