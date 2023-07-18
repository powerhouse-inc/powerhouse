import { loadScopeFrameworkFromInput } from '@acaldas/document-model-libs/browser/scope-framework';
import { useDrop } from 'react-aria';
import { useNavigate } from 'react-router-dom';
import { Tab, TabScopeFramework, useTabs } from '../store';

export function useDropFile(ref: React.RefObject<HTMLElement>) {
    const { addTab, selectedTab, getItem, updateTab } = useTabs();
    const navigate = useNavigate();

    return useDrop({
        ref,
        async onDrop(e) {
            for (const item of e.items) {
                if (item.kind === 'file') {
                    const file = await item.getFile();
                    const document = await loadScopeFrameworkFromInput(file);
                    if (document.documentType !== 'makerdao/scope-framework') {
                        return;
                    }

                    const currentTab = selectedTab
                        ? getItem(selectedTab)
                        : undefined;
                    const isNewTab = currentTab?.type === 'new';

                    const tab = new TabScopeFramework(
                        document,
                        undefined,
                        isNewTab ? selectedTab : undefined
                    );
                    updateTab(tab);
                    navigate('/');
                } else if (item.kind === 'text') {
                    try {
                        const tabStr = await item.getText('tab');
                        const tab = Tab.fromString(tabStr);
                        addTab(tab);
                        navigate('/');
                    } catch (error) {
                        console.log(
                            `Dropped text not recognized as tab: ${error}`
                        );
                        console.log(item);
                    }
                }
            }
        },
    });
}
