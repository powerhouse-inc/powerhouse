import {
    BudgetStatementDocument,
    utils,
} from '@acaldas/document-model-libs/budget-statement';
import { Document } from 'document-model-editors';
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import BudgetStatementEditor from '../budget-statement/editor';
import Tabs, { ITab } from './tabs';

type Tab = ITab &
    ({} | { budget: BudgetStatementDocument } | { document: true });

const App: React.FC = () => {
    const [tabs, setTabs] = useState<Tab[]>([newTab()]);
    const [activeTab, setActiveTab] = useState<React.Key>();

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
            if (tab && Object.keys(tab).includes('budget')) {
                // @ts-ignore
                window.electronAPI?.saveFile(tab.budget);
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
                    <button onClick={handleNewDocumentModel}>
                        New Document Model
                    </button>
                    <button
                        className="px-0"
                        onClick={() => handleNewBudgetStatement()}
                        style={{ marginLeft: 20 }}
                    >
                        New Budget Statement
                    </button>
                </div>
            ),
        };
    }

    function newDocumentModel(): Tab {
        return {
            name: 'Document Model',
            content: <Document.Editor />,
        };
    }

    function newBudgetStatement(budget?: BudgetStatementDocument): Tab {
        const newBudget = budget ?? utils.createBudgetStatement();
        return {
            name: newBudget.name || newBudget.data.month || 'Budget',
            budget: newBudget,
            content: <BudgetStatementEditor initialBudget={newBudget} />,
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
        const budgetTab = newBudgetStatement(budget);
        setTabs(tabs => {
            setTimeout(() => setActiveTab(budgetTab.name + tabs.length), 100);
            return [...tabs, budgetTab];
        });
    }

    function handleNewDocumentModel() {
        const document = newDocumentModel();
        setTabs(tabs => {
            setTimeout(() => setActiveTab(document.name + tabs.length));
            return [...tabs, document];
        });
    }
    return (
        <div className="h-screen overflow-auto bg-bg py-3 pl-16 text-white">
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
