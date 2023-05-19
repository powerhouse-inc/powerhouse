import {
    BudgetStatementDocument,
    utils,
} from '@acaldas/document-model-libs/browser/budget-statement';
import { Document } from 'document-model-editors';
import {
    DraggableCollectionEndEvent,
    DroppableCollectionReorderEvent,
    DroppableCollectionRootDropEvent,
    TextDropItem,
} from 'react-aria-components';
import { Item, useListData } from 'react-stately';
import BudgetStatementEditor from '../budget-statement/editor';
import { ReorderableTabList } from './list';

type TabType =
    | ''
    | 'new'
    | 'powerhouse/document-model'
    | 'powerhouse/budget-statement';

export abstract class Tab {
    public abstract type: TabType;
    constructor(
        public name: string,
        public content: React.ReactElement,
        public id: string = window.crypto.randomUUID()
    ) {}

    abstract serialize(): string;

    saveFile(): unknown | null {
        return null;
    }
}

export class TabNew extends Tab {
    public type: TabType = 'new';

    constructor(
        public handleNewDocumentModel: () => void,
        public handleNewBudgetStatement: () => void,
        id?: string
    ) {
        const content = (
            <div>
                <button
                    className="underline underline-offset-4"
                    onClick={handleNewDocumentModel}
                >
                    New Document Model
                </button>
                <button
                    className="px-0 underline underline-offset-4"
                    onClick={() => handleNewBudgetStatement()}
                    style={{ marginLeft: 20 }}
                >
                    New Budget Statement
                </button>
            </div>
        );

        super('New tab', content, id);
    }

    serialize() {
        return JSON.stringify([this.id]);
    }
}

export class TabBudgetStatement extends Tab {
    public type: TabType = 'powerhouse/budget-statement';
    public budgetStatement: BudgetStatementDocument;

    constructor(_budgetStatement?: BudgetStatementDocument, name?: string) {
        const budgetStatement =
            _budgetStatement ?? utils.createBudgetStatement();
        const content = (
            <BudgetStatementEditor
                initialBudget={budgetStatement}
                onChange={budget => {
                    this.budgetStatement = budget;
                }}
            />
        );

        super(
            name ||
                budgetStatement.name ||
                budgetStatement.data.month ||
                'Budget',
            content
        );

        this.budgetStatement = budgetStatement;
    }

    serialize(): string {
        return JSON.stringify([this.budgetStatement, this.name]);
    }

    override saveFile(): BudgetStatementDocument {
        return this.budgetStatement;
    }
}

export class TabDocumentModel extends Tab {
    public type: TabType = 'powerhouse/document-model';

    constructor(name?: string) {
        super(name || 'Document Model', <Document.Editor />);
    }

    serialize(): string {
        return JSON.stringify([this.name]);
    }
}

interface IProps {
    tabs: ReturnType<typeof useTabs>;
    onNewTab: (tab?: Tab, args?: unknown[]) => void;
}

export default function ({ tabs, onNewTab }: IProps) {
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
        >
            {/* @ts-ignore */}
            {item => <Item>{item.name}</Item>}
        </ReorderableTabList>
    );
}

export const useTabs = (initialTabs: Tab[]) => {
    const list = useListData<Tab>({
        initialItems: initialTabs,
        getKey: item => {
            return item.id;
        },
    });
    const { selectedKeys, setSelectedKeys, removeSelectedItems, ...result } =
        list;
    return {
        ...result,
        selectedTab: [...selectedKeys].pop(),
        setSelectedTab: (key: string) => setSelectedKeys(new Set([key])),
        removeSelectedTab: removeSelectedItems,
    };
};
