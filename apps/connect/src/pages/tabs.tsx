import { BudgetStatementDocument } from '@acaldas/document-model-libs/browser/budget-statement';
import { useEffect } from 'react';
import Tabs, {
    Tab,
    TabBudgetStatement,
    TabDocumentModel,
    TabNew,
    useTabs,
} from '../components/tabs';

export default () => {
    const tabs = useTabs([
        new TabNew(handleNewDocumentModel, handleNewBudgetStatement),
        new TabBudgetStatement(),
        new TabDocumentModel(),
    ]);

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

    function handleCloseTab(tab: Tab) {
        tabs.remove(tab.id);
    }
    return (
        <div className="h-full pt-2">
            <Tabs
                tabs={tabs}
                onNewTab={handleNewTab}
                onCloseTab={handleCloseTab}
            />
        </div>
    );
};
