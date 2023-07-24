import { loadScopeFrameworkFromInput } from '@acaldas/document-model-libs/browser/scope-framework';
import { useCallback } from 'react';
import { useDrop } from 'react-aria';
import { useNavigate } from 'react-router-dom';
import { Tab, createScopeFrameworkTab, useTabs } from 'src/store';

export function useDropFile(ref: React.RefObject<HTMLElement>) {
    const { addTab, selectedTab, getItem, updateTab } = useTabs();
    const navigate = useNavigate();

    const onDrop = useCallback(
        async (e: any) => {
            for (const item of e.items) {
                if (item.kind === 'file') {
                    const file = await item.getFile();
                    const document = await loadScopeFrameworkFromInput(file);
                    if (document.documentType !== 'makerdao/scope-framework') {
                        return;
                    }

                    const tab = createScopeFrameworkTab(document);
                    addTab(tab);
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
        [addTab, selectedTab, getItem, updateTab]
    );

    return useDrop({
        ref,
        onDrop,
    });
}
