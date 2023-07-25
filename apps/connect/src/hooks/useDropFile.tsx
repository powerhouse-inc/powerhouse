import { useCallback } from 'react';
import { useDrop } from 'react-aria';
import { useNavigate } from 'react-router-dom';
import { Tab, useTabs } from 'src/store';
import { loadFile } from 'src/utils/file';

export function useDropFile(ref: React.RefObject<HTMLElement>) {
    const { addTab, selectedTab, getItem, updateTab } = useTabs();
    const navigate = useNavigate();

    const onDrop = useCallback(
        async (e: any) => {
            for (const item of e.items) {
                if (item.kind === 'file') {
                    const file = await item.getFile();
                    const document = await loadFile(file);
                    const tab = Tab.fromDocument(document);
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
