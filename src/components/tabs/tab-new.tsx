import { useAtomValue } from 'jotai';
import { useEffect, useRef } from 'react';
import { useDropFile, useOpenFile } from 'src/hooks';
import { useDocumentDrive } from 'src/hooks/useDocumentDrive';
import { preloadTabs, useTabs, useTheme } from 'src/store';
import { documentModelsAtom } from 'src/store/document-model';
import Button from '../button';

export default () => {
    const ref = useRef(null);
    const theme = useTheme();
    const { selectedTab, updateTab, fromDocument } = useTabs();
    const { documentDrive, addFile, openFile } = useDocumentDrive();
    const { dropProps, isDropTarget } = useDropFile(ref);
    const documentModels = useAtomValue(documentModelsAtom);

    const handleOpenFile = useOpenFile(async (document, file) => {
        const drive = documentDrive?.state.drives[0]; // TODO improve default drive selection
        if (drive) {
            const node = await addFile(file, file.name, drive.id);
            if (node) {
                openFile(drive.id, node.path, selectedTab);
            }
        } else {
            updateTab(await fromDocument(document, selectedTab));
        }
    });

    // preload document editors
    useEffect(() => {
        preloadTabs();
    }, []);

    return (
        <div>
            <div className="mb-10 flex gap-4">
                {documentModels.map(doc => (
                    <Button
                        key={doc.documentModel.id}
                        title={doc.documentModel.description}
                        aria-label={doc.documentModel.description}
                        className="bg-accent-1 text-text"
                        onClick={async () => {
                            updateTab(
                                await fromDocument(
                                    doc.utils.createDocument(),
                                    selectedTab
                                )
                            );
                        }}
                    >
                        New {doc.documentModel.name}
                    </Button>
                ))}
            </div>
            <h2 className="h2">Open existing file</h2>
            <div
                {...dropProps}
                ref={ref}
                className={`h-[240px] rounded-xl border-2 border-dashed
                ${
                    theme === 'dark'
                        ? 'border-neutral-1/20'
                        : 'border-accent-5/20'
                }
                ${
                    isDropTarget ? 'bg-light' : 'bg-bg'
                } my-6 flex max-w-4xl flex-col items-center justify-evenly py-5`}
            >
                <div className="h-9 select-none opacity-0"></div>
                <p className="text-accent-5">Drag file here</p>
                <Button className="button" onClick={handleOpenFile}>
                    Browse
                </Button>
            </div>
        </div>
    );
};
