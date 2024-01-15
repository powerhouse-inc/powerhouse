import { useEffect } from 'react';
import {
    DraggableCollectionEndEvent,
    DroppableCollectionReorderEvent,
    DroppableCollectionRootDropEvent,
    TextDropItem,
} from 'react-aria-components';
import { Item } from 'react-stately';
import { Tab, useTabs } from 'src/store/tabs';
import { ReorderableTabList } from './reordable-tab-list';

interface IProps {
    tabs: ReturnType<typeof useTabs>;
    onNewTab: (tab?: Tab, args?: unknown[]) => void;
    onCloseTab: (tab: Tab) => void;
    onUpdateTab: (tab: Tab) => void;
}

export default function Tabs({ tabs, onNewTab, onCloseTab, onUpdateTab }: IProps) {
    const onReorder = (e: DroppableCollectionReorderEvent) => {
        if (e.target.dropPosition === 'before') {
            tabs.moveBefore(e.target.key, e.keys);
        } else if (e.target.dropPosition === 'after') {
            tabs.moveAfter(e.target.key, e.keys);
        }
    };

    const handleTextdrop = async (item: TextDropItem) => {
        try {
            const tabStr = await item.getText('tab');
            const tab = await tabs.fromString(tabStr);
            onNewTab(tab);
        } catch (e) {
            console.error(e);
        }
    };

    const onRootDrop = (e: DroppableCollectionRootDropEvent) => {
        e.items.forEach(item => {
            switch (item.kind) {
                case 'text':
                    handleTextdrop(item);
                    break;
                case 'directory':
                    console.log('Directory dropped'); // TODO
                    break;
                case 'file':
                    console.log('File dropped'); // TODO
                    break;
            }
        });
    };

    const onSelectionChange = (key: string | number) => {
        tabs.setSelectedTab(key.toString());
    };

    const onDragOut = (e: DraggableCollectionEndEvent) => {
        // check window bounds
        if (
            e.x < 0 ||
            e.x > window.innerWidth ||
            e.y < 0 ||
            e.y > window.innerHeight
        ) {
            tabs.remove(...e.keys);
        }
    };

    useEffect(() => {
        const removeHandler1 = window.electronAPI?.handleAddTab(
            async (_, tabStr) => {
                const tab = await tabs.fromString(tabStr);
                tabs.addTab(tab);
            }
        );

        const removeHandler2 = window.electronAPI?.handleRemoveTab(
            async (_, tabStr) => {
                const tab = await tabs.fromString(tabStr);
                tabs.remove(tab.id);
            }
        );
        return () => {
            removeHandler1?.();
            removeHandler2?.();
        };
    }, [tabs]);

    return (
        <ReorderableTabList
            aria-label="Tabs"
            items={tabs.items}
            selectedKey={tabs.selectedTab}
            onSelectionChange={onSelectionChange}
            onReorder={onReorder}
            onRootDrop={onRootDrop}
            onDragOut={onDragOut}
            onCloseTab={onCloseTab}
            onUpdateTab={onUpdateTab}
            onNewTab={() => onNewTab()}
            // eslint-disable-next-line react/no-children-prop
            children={item => <Item>{item.name}</Item>}
        />
    );
}
