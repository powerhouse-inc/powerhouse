import { useAtomValue } from 'jotai';
import { useEffect, useRef } from 'react';
import { useDropFile, useOpenFile } from 'src/hooks';
import { useDocumentDriveServer } from 'src/hooks/useDocumentDriveServer';
import { documentModelsAtom } from 'src/store/document-model';
import { preloadTabs, useTabs } from 'src/store/tabs';
import Button from '../button';

export default function TabNew() {
    const ref = useRef(null);
    const { selectedTab, updateTab, fromDocument } = useTabs();
    const { documentDrives, addFile, openFile } = useDocumentDriveServer();
    const { dropProps, isDropTarget } = useDropFile(ref);
    const documentModels = useAtomValue(documentModelsAtom);

    const handleOpenFile = useOpenFile(async (document, file) => {
        const drive = documentDrives[0]; // TODO improve default drive selection
        if (drive) {
            const node = await addFile(file, drive.state.global.id, file.name);
            if (node) {
                openFile(drive.state.global.id, node.id);
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
                        className="bg-gray-100 text-slate-800"
                        onClick={async () => {
                            updateTab(
                                await fromDocument(
                                    doc.utils.createDocument(),
                                    selectedTab,
                                ),
                            );
                        }}
                    >
                        New {doc.documentModel.name}
                    </Button>
                ))}
            </div>
            <h2 className="text-4xl font-bold tracking-wide">
                Open existing file
            </h2>
            <div
                {...dropProps}
                ref={ref}
                className={`h-60 rounded-xl border-2 border-dashed border-gray-500/20
                ${
                    isDropTarget ? 'bg-slate-50' : 'bg-white'
                } my-6 flex max-w-4xl flex-col items-center justify-evenly py-5`}
            >
                <div className="h-9 select-none opacity-0"></div>
                <p className="text-gray-500">Drag file here</p>
                <Button onClick={handleOpenFile}>Browse</Button>
            </div>
        </div>
    );
}
