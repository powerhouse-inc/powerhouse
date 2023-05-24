import {
    BudgetStatementDocument,
    utils,
} from '@acaldas/document-model-libs/browser/budget-statement';
import { Document } from 'document-model-editors';
import { atom, useAtom } from 'jotai';
import { useMemo } from 'react';
import { ListData } from 'react-stately';
import BudgetStatementEditor from '../budget-statement/editor';

export type TabType =
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
        public addDocumentModelTab: () => void,
        public addBudgetStatementTab: () => void,
        id?: string
    ) {
        const content = (
            <div>
                <button
                    className="underline underline-offset-4"
                    onClick={addDocumentModelTab}
                >
                    New Document Model
                </button>
                <button
                    className="px-0 underline underline-offset-4"
                    onClick={() => addBudgetStatementTab()}
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

export const tabsAtom = atom<Tab[]>([]);
export const selectedTabAtom = atom<Tab['id'] | undefined>(undefined);

function moveTab(tabs: Tab[], indices: number[], toIndex: number): Tab[] {
    // Shift the target down by the number of items being moved from before the target
    toIndex -= indices.filter(index => index < toIndex).length;

    const moves = indices.map(from => ({
        from,
        to: toIndex++,
    }));

    // Shift later from indices down if they have a larger index
    for (let i = 0; i < moves.length; i++) {
        const a = moves[i].from;
        for (let j = i; j < moves.length; j++) {
            const b = moves[j].from;

            if (b > a) {
                moves[j].from--;
            }
        }
    }

    // Interleave the moves so they can be applied one by one rather than all at once
    for (let i = 0; i < moves.length; i++) {
        const a = moves[i];
        for (let j = moves.length - 1; j > i; j--) {
            const b = moves[j];

            if (b.from < a.to) {
                a.to++;
            } else {
                b.from++;
            }
        }
    }

    const copy = tabs.slice();
    for (const move of moves) {
        const [item] = copy.splice(move.from, 1);
        copy.splice(move.to, 0, item);
    }

    return copy;
}

export const useTabs = () => {
    const [_tabs, setTabs] = useAtom(tabsAtom);
    const [selectedTab, setSelectedTab] = useAtom(selectedTabAtom);

    const tabs: Pick<
        ListData<Tab>,
        'items' | 'getItem' | 'append' | 'moveBefore' | 'moveAfter' | 'remove'
    > & {
        selectedTab: typeof selectedTab;
        setSelectedTab: typeof setSelectedTab;
        addTab: (tab?: Tab, args?: any[]) => void;
        addDocumentModelTab: () => void;
        addBudgetStatementTab: (budget?: BudgetStatementDocument) => void;
        closeTab: (tab: Tab) => void;
    } = useMemo(
        () => ({
            items: _tabs,
            getItem(key) {
                return _tabs.find(tab => tab.id === key)!;
            },
            append(...values) {
                setTabs(tabs => [...tabs, ...values]);
            },
            moveBefore(key, keys) {
                setTabs(tabs => {
                    const toIndex = tabs.findIndex(t => t.id === key);
                    if (toIndex === -1) {
                        return tabs;
                    }

                    const keyArray = Array.isArray(keys) ? keys : [...keys];
                    const indices = keyArray
                        .map(key => tabs.findIndex(item => item.id === key))
                        .sort();
                    return moveTab(tabs, indices, toIndex);
                });
            },
            moveAfter(key, keys) {
                setTabs(tabs => {
                    const toIndex = tabs.findIndex(item => item.id === key);
                    if (toIndex === -1) {
                        return tabs;
                    }

                    const keyArray = Array.isArray(keys) ? keys : [...keys];
                    const indices = keyArray
                        .map(key => tabs.findIndex(item => item.id === key))
                        .sort();
                    return moveTab(tabs, indices, toIndex + 1);
                });
            },
            remove(...keys) {
                setTabs(tabs => tabs.filter(tab => !keys.includes(tab.id)));
            },
            selectedTab,
            setSelectedTab,
            addTab(tab?: Tab, args?: any[]) {
                const newTab =
                    tab ??
                    new TabNew(
                        tabs.addDocumentModelTab,
                        tabs.addBudgetStatementTab,
                        ...(args ?? [])
                    );
                tabs.append(newTab);
                tabs.setSelectedTab(newTab.id);
            },
            addBudgetStatementTab(budget?: BudgetStatementDocument) {
                const tab = new TabBudgetStatement(budget);
                tabs.addTab(tab);
            },
            addDocumentModelTab() {
                const tab = new TabDocumentModel();
                tabs.addTab(tab);
            },
            closeTab(tab: Tab) {
                tabs.remove(tab.id);
            },
        }),
        [_tabs, selectedTab]
    );

    return tabs;
};
