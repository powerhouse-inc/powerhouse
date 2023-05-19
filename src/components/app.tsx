import {
    BudgetStatementDocument,
    utils,
} from '@acaldas/document-model-libs/browser/budget-statement';
import React, { useEffect } from 'react';
import { useDrop } from 'react-aria';
import { FileDropItem } from 'react-aria-components';
import { createRoot } from 'react-dom/client';
import Tabs, {
    Tab,
    TabBudgetStatement,
    TabDocumentModel,
    TabNew,
    useTabs,
} from './tabs';

const App: React.FC = () => {
    const tabs = useTabs([
        new TabNew(handleNewDocumentModel, handleNewBudgetStatement),
        new TabBudgetStatement(),
        new TabDocumentModel(),
    ]);

    const ref = React.useRef(null);

    const { dropProps, isDropTarget } = useDrop({
        ref,
        async onDrop(e) {
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
            const selectedTab = tabs.selectedTab;
            if (!selectedTab) {
                return;
            }
            const tab = tabs.getItem(selectedTab);
            const file = tab.saveFile();
            if (file) {
                window.electronAPI?.saveFile(file);
            }
        });
        return () => {
            removeListener?.();
        };
    }, [tabs]);

    function handleNewTab(tab?: Tab, args?: any[]) {
        const newTab =
            tab ??
            new TabNew(
                handleNewDocumentModel,
                handleNewBudgetStatement,
                ...(args ?? [])
            );
        tabs.append(newTab);
        tabs.setSelectedTab(newTab.id);
    }

    function handleNewBudgetStatement(budget?: BudgetStatementDocument) {
        const tab = new TabBudgetStatement(budget);
        handleNewTab(tab);
    }

    function handleNewDocumentModel() {
        const tab = new TabDocumentModel();
        handleNewTab(tab);
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
                <Tabs tabs={tabs} onNewTab={handleNewTab} />
            </div>
        </div>
    );
};

createRoot(document.getElementById('app') as HTMLElement).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>
);
