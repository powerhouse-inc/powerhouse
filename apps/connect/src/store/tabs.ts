import {
    BudgetStatementDocument,
    utils,
} from '@acaldas/document-model-libs/browser/budget-statement';
import { Document } from '@acaldas/document-model-libs/document';
import { Document as DocumentEditors } from 'document-model-editors';
import { atom, useAtom } from 'jotai';
import { ReactElement, useMemo } from 'react';
import { ListData } from 'react-stately';
import { createBudgetStatementEditor } from '../budget-statement/editor';
import tabNew from '../components/tabs/tab-new';

export type TabType =
    | ''
    | 'new'
    | 'powerhouse/document-model'
    | 'powerhouse/budget-statement';

export abstract class Tab {
    public abstract type: TabType;
    constructor(
        public name: string,
        public content: () => ReactElement,
        public id: string = window.crypto.randomUUID()
    ) {}

    abstract serialize(): string;

    saveFile(): unknown | null {
        return null;
    }

    static fromString(value: string): Tab {
        const object = JSON.parse(value);
        const type = object.type as TabType;
        switch (object.type) {
            case 'new':
                return new TabNew(object.id);
            case 'powerhouse/budget-statement':
                return new TabBudgetStatement(
                    object.budgetStatement,
                    object.name,
                    object.id
                );
            case 'powerhouse/document-model':
                return new TabDocumentModel(object.name, object.id);
            default:
                throw new Error(`Tab type ${type} was not handled`);
        }
    }

    static fromDocument(document: Document) {
        switch (document.documentType) {
            case 'powerhouse/budget-statement':
                return new TabBudgetStatement(
                    document as BudgetStatementDocument,
                    document.name
                );
            case 'powerhouse/document-model':
                return new TabDocumentModel(document.name);
            default:
                throw new Error(
                    `Document with type ${document.documentType} was not handled`
                );
        }
    }
}

export class TabNew extends Tab {
    public type: TabType = 'new';

    constructor(id?: string) {
        super('New tab', tabNew, id);
    }

    serialize() {
        return JSON.stringify({
            type: this.type,
            id: this.id,
        });
    }
}

export class TabBudgetStatement extends Tab {
    public type: TabType = 'powerhouse/budget-statement';
    public budgetStatement: BudgetStatementDocument;

    constructor(
        _budgetStatement?: BudgetStatementDocument,
        name?: string,
        id?: string
    ) {
        const budgetStatement =
            _budgetStatement ?? utils.createBudgetStatement();
        const content = createBudgetStatementEditor({
            initialBudget: budgetStatement,
            onChange: budget => {
                this.budgetStatement = budget;
            },
        });

        super(
            name ||
                budgetStatement.name ||
                budgetStatement.data.month ||
                'Budget',
            content,
            id
        );

        this.budgetStatement = budgetStatement;
    }

    serialize() {
        return JSON.stringify({
            type: this.type,
            id: this.id,
            name: this.name,
            budgetStatement: this.budgetStatement,
        });
    }

    override saveFile(): BudgetStatementDocument {
        return this.budgetStatement;
    }
}

export class TabDocumentModel extends Tab {
    public type: TabType = 'powerhouse/document-model';

    constructor(name?: string, id?: string) {
        super(name || 'Document Model', DocumentEditors.Editor, id);
    }

    serialize() {
        return JSON.stringify({
            type: this.type,
            id: this.id,
            name: this.name,
        });
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
        addTab: (tab?: Tab) => void;
        closeTab: (tab: Tab) => void;
    } = useMemo(
        () => ({
            items: _tabs,
            getItem(key) {
                const tab = _tabs.find(tab => tab.id === key);
                if (!tab) {
                    throw new Error(`Tab with id ${key} not found`);
                }
                return tab;
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
            addTab(tab?: Tab) {
                const newTab = tab ?? new TabNew();
                tabs.append(newTab);
                tabs.setSelectedTab(newTab.id);
            },
            closeTab(tab: Tab) {
                tabs.remove(tab.id);
            },
        }),
        [_tabs, selectedTab]
    );

    return tabs;
};
