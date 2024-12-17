import { useEffect } from 'react';
import Tabs from 'src/components/tabs';
import { useGetDocumentModel } from 'src/store/document-model';
import { useTabs } from 'src/store/tabs';
import { exportFile, loadFile } from 'src/utils/file';

const TabsContainer = () => {
    const tabs = useTabs();
    const getDocumentModel = useGetDocumentModel();

    useEffect(() => {
        return window.electronAPI?.handleFileOpen(async file => {
            const document = await loadFile(file, getDocumentModel);
            const tab = await tabs.fromDocument(document);
            tabs.addTab(tab);
        });
    }, [tabs]);

    async function handleFileSave() {
        const selectedTab = tabs.selectedTab;
        if (!selectedTab) {
            return;
        }
        const tab = tabs.getItem(selectedTab);
        if (!tab.document) {
            throw new Error('Current tab is not a document');
        }

        exportFile(tab.document, getDocumentModel);
    }

    useEffect(() => {
        const removeHandler =
            window.electronAPI?.handleFileSave(handleFileSave);

        function handleKeyboardSave(e: KeyboardEvent) {
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                handleFileSave();
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
