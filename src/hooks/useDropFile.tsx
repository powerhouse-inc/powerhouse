import type { DropEvent } from '@react-types/shared';
import { useCallback } from 'react';
import { useDrop } from 'react-aria';
import { useNavigate } from 'react-router-dom';
import { useTabs } from 'src/store';
import { useGetDocumentModel } from 'src/store/document-model';
import { loadFile } from 'src/utils/file';

export function useDropFile(ref: React.RefObject<HTMLElement>) {
    const {
        addTab,
        selectedTab,
        getItem,
        updateTab,
        fromDocument,
        fromString,
    } = useTabs();
    const navigate = useNavigate();
    const getDocumentModel = useGetDocumentModel();

    const onDrop = useCallback(
        async (e: DropEvent) => {
            for (const item of e.items) {
                if (item.kind === 'file') {
                    const file = await item.getFile();
                    const document = await loadFile(file, getDocumentModel);
                    const tab = await fromDocument(document);
                    addTab(tab);
                    navigate('/');
                } else if (item.kind === 'text') {
                    try {
                        const tabStr = await item.getText('tab');
                        const tab = await fromString(tabStr);
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
