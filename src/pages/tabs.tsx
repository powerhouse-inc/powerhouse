import { useEffect } from 'react';
import Tabs from '../components/tabs';
import { TabBudgetStatement, useTabs } from '../store/tabs';

export default () => {
    const tabs = useTabs();

    useEffect(() => {
        return window.electronAPI?.handleFileOpened(file => {
            if (file) {
                // TODO deal with different files
                const tab = new TabBudgetStatement(file);
                tabs.addTab(tab);
            }
        });
    }, [tabs]);

    useEffect(() => {
        return window.electronAPI?.handleFileSaved(() => {
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
    }, [tabs]);

    return (
        <div className="h-full">
            <Tabs
                tabs={tabs}
                onNewTab={tabs.addTab}
                onCloseTab={tabs.closeTab}
            />
        </div>
    );
};
