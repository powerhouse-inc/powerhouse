import { useEffect } from 'react';
import Tabs from 'src/components/tabs';
import { useTabs } from 'src/store/tabs';
import { saveFile } from 'src/utils/file';

const TabsContainer = () => {
    const tabs = useTabs();

    useEffect(() => {
        return window.electronAPI?.handleFileOpened(async file => {
            if (file) {
                const tab = await tabs.fromDocument(file);
                tabs.addTab(tab);
            }
        });
    }, [tabs]);

    async function handleFileSaved() {
        const selectedTab = tabs.selectedTab;
        if (!selectedTab) {
            return;
        }
        const tab = tabs.getItem(selectedTab);
        if (tab.document) {
            const fileHandle = await window.showSaveFilePicker({
                suggestedName: `${tab.document.name || 'Untitled'}.zip`,
            });
            saveFile(tab.document, fileHandle);
        }
    }

    useEffect(() => {
        const removeHandler =
            window.electronAPI?.handleFileSaved(handleFileSaved);

        function handleKeyboardSave(e: KeyboardEvent) {
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                handleFileSaved();
            }
        }

        document.addEventListener('keydown', handleKeyboardSave);

        return () => {
            removeHandler?.();
            document.removeEventListener('keydown', handleKeyboardSave);
        };
    }, [tabs]);

    return (
        <div className="h-full">
            <Tabs
                tabs={tabs}
                onNewTab={tabs.addTab}
                onCloseTab={tabs.closeTab}
                onUpdateTab={tabs.updateTab}
            />
        </div>
    );
};

export const element = <TabsContainer />;
export default TabsContainer;
