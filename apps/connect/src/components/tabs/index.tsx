import {
    DraggableCollectionEndEvent,
    DroppableCollectionReorderEvent,
    DroppableCollectionRootDropEvent,
    TextDropItem,
} from 'react-aria-components';
import { Item } from 'react-stately';
import {
    Tab,
    TabBudgetStatement,
    TabDocumentModel,
    TabType,
    useTabs,
} from '../../store/tabs';
import { ReorderableTabList } from './reordable-tab-list';

interface IProps {
    tabs: ReturnType<typeof useTabs>;
    onNewTab: (tab?: Tab, args?: unknown[]) => void;
    onCloseTab: (tab: Tab) => void;
}

export default function ({ tabs, onNewTab, onCloseTab }: IProps) {
    const onReorder = (e: DroppableCollectionReorderEvent) => {
        if (e.target.dropPosition === 'before') {
            tabs.moveBefore(e.target.key, e.keys);
        } else if (e.target.dropPosition === 'after') {
            tabs.moveAfter(e.target.key, e.keys);
        }
    };

    const handleTextdrop = async (item: TextDropItem) => {
        const type = (await item.getText('type')) as TabType;
        const args = await item.getText('args');
        switch (type) {
            case 'new':
                onNewTab(undefined, JSON.parse(args));
                break;
            case 'powerhouse/budget-statement':
                onNewTab(new TabBudgetStatement(...JSON.parse(args)));
                break;
            case 'powerhouse/document-model':
                onNewTab(new TabDocumentModel(...JSON.parse(args)));
                break;
            default:
                console.log(`Tab type ${type} wasn't handled`);
        }
    };

    const onRootDrop = (e: DroppableCollectionRootDropEvent) => {
        e.items.forEach(item => {
            switch (item.kind) {
                case 'text':
                    handleTextdrop(item);
                    break;
                case 'directory':
                    console.log('Directory dropped');
                    break;
                case 'file':
                    console.log('File dropped');
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

    return (
        <ReorderableTabList
            aria-label="Favorite animals"
            items={tabs.items}
            selectedKey={tabs.selectedTab}
            onSelectionChange={onSelectionChange}
            onReorder={onReorder}
            onRootDrop={onRootDrop}
            onDragOut={onDragOut}
            onCloseTab={onCloseTab}
            onNewTab={() => onNewTab()}
            children={item => <Item>{item.name}</Item>}
        />
    );
}
