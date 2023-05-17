import {
    BudgetStatementDocument,
    utils,
} from '@acaldas/document-model-libs/browser/budget-statement';
import { Document } from 'document-model-editors';
import React, { useEffect, useState } from 'react';
import { useDrop } from 'react-aria';
import { FileDropItem } from 'react-aria-components';
import { createRoot } from 'react-dom/client';
import BudgetStatementEditor from '../budget-statement/editor';
import Tabs, { Tab } from './tabs';

class TabBudgetStatement extends Tab {
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
}

class TabDocumentModel extends Tab {
    constructor(name?: string) {
        super(name || 'Document Model', <Document.Editor />);
    }
}

const App: React.FC = () => {
    const [tabs, setTabs] = useState<Tab[]>([
        newTab(),
        new TabBudgetStatement(),
        new TabDocumentModel(),
    ]);
    const [activeTab, setActiveTab] = useState<React.Key>();

    const ref = React.useRef(null);

    const { dropProps, isDropTarget } = useDrop({
        ref,
        async onDrop(e) {
            console.log(e);
            const files = e.items.filter(
                item => item.kind === 'file'
            ) as FileDropItem[];
            files.forEach(async item => {
                const file = await item.getFile();
                const budget = await utils.loadBudgetStatementFromInput(file);
                handleNewBudgetStatement(budget);
            });
        },
    });

    useEffect(() => {
        window.electronAPI?.handleFileOpened(file => {
            if (file) {
                handleNewBudgetStatement(file);
            }
        });
    }, [window.electronAPI]);

    useEffect(() => {
        const removeListener = window.electronAPI?.handleFileSaved(() => {
            const tab = tabs.find(({ name }, i) => name + i === activeTab);
            if (tab && tab instanceof TabBudgetStatement) {
                window.electronAPI?.saveFile(tab.budgetStatement);
            }
        });
        return () => {
            removeListener?.();
        };
    }, [tabs, activeTab]);

    function newTab(): Tab {
        return {
            name: 'New Document',
            content: (
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
            ),
        };
    }

    function handleNewTab() {
        const tab = newTab();
        setTabs(tabs => {
            setTimeout(() => setActiveTab(tab.name + tabs.length));
            return [...tabs, tab];
        });
    }

    function handleNewBudgetStatement(budget?: BudgetStatementDocument) {
        const budgetTab = new TabBudgetStatement(budget);
        setTabs(tabs => {
            setTimeout(() => setActiveTab(budgetTab.name + tabs.length), 100);
            return [...tabs, budgetTab];
        });
    }

    function handleNewDocumentModel() {
        const document = new TabDocumentModel();
        setTabs(tabs => {
            setTimeout(() => setActiveTab(document.name + tabs.length));
            return [...tabs, document];
        });
    }

    return (
        <div
            className={`h-screen overflow-auto ${
                isDropTarget ? 'bg-light' : 'bg-bg'
            } px-16 py-3 text-white`}
            {...dropProps}
            role="presentation"
            tabIndex={0}
            ref={ref}
        >
            <div className="mb-5">
                <Tabs
                    tabs={tabs}
                    onCreate={handleNewTab}
                    selectedTab={activeTab}
                    onTabSelected={setActiveTab}
                />
            </div>
        </div>
    );
};

createRoot(document.getElementById('app') as HTMLElement).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>
);
