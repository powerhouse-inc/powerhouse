import type { DropEvent } from '@react-types/shared';
import { useCallback } from 'react';
import { useDrop } from 'react-aria';
import { useNavigate } from 'react-router-dom';
import { useTabs } from 'src/store';
import { useGetDocumentModel } from 'src/store/document-model';
import { loadFile } from 'src/utils/file';
import { useDocumentDrive } from './useDocumentDrive';

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
    const { documentDrive, addFile, openFile } = useDocumentDrive();

    const onDrop = useCallback(
        async (e: DropEvent) => {
            for (const item of e.items) {
                if (item.kind === 'file') {
                    const file = await item.getFile();
                    const document = await loadFile(file, getDocumentModel);
                    const tab = await fromDocument(document, selectedTab);

                    const drive = documentDrive?.state.drives[0]; // TODO improve default drive selection
                    if (drive) {
                        const node = await addFile(file, file.name, drive.id);
                        if (node) {
                            openFile(drive.id, node.path);
                        }
                    } else {
                        addTab(tab);
                    }
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
        [addTab, selectedTab, getItem, updateTab, documentDrive]
    );

    return useDrop({
        ref,
        onDrop,
    });
}
