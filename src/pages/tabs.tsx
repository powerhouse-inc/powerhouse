import { useEffect } from 'react';
import Tabs from '../components/tabs';
import { useTabs } from '../store/tabs';

export default () => {
    const tabs = useTabs();

    useEffect(() => {
        if (!tabs.items.length) {
            tabs.handleNewTab();
        }
    }, []);
    useEffect(() => {
        window.electronAPI?.handleFileOpened(file => {
            if (file) {
                tabs.handleNewBudgetStatement(file);
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
    return (
        <div className="h-full pt-2">
            <Tabs
                tabs={tabs}
                onNewTab={tabs.handleNewTab}
                onCloseTab={tabs.handleCloseTab}
            />
        </div>
    );
};
