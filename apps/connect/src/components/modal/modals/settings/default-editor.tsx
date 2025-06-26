import {
    useSelectedDefaultDocumentModelEditorId,
    useSetSelectedDefaultDocumentModelEditorId,
} from '@powerhousedao/common';
import { DefaultEditor as BaseDefaultEditor } from '@powerhousedao/design-system';
import { type DocumentModelModule } from 'document-model';
import { useCallback } from 'react';

const mapDocumentModelsToOptions = (documentModels: DocumentModelModule[]) =>
    documentModels.map(document => ({
        label: document.documentModel.name,
        value: document.documentModel.id,
    }));

const documentModelEditorOptions = [
    { label: 'V1', value: 'document-model-editor' },
    { label: 'V2', value: 'document-model-editor-v2' },
] as const;

export const DefaultEditor: React.FC = () => {
    const selectedDefaultDocumentModelEditorId =
        useSelectedDefaultDocumentModelEditorId();
    const setSelectedDefaultDocumentModelEditorId =
        useSetSelectedDefaultDocumentModelEditorId();

    const handleSetDocumentEditor = useCallback((value: string) => {
        const option = documentModelEditorOptions.find(dm => dm.value == value);
        if (option) {
            setSelectedDefaultDocumentModelEditorId(option.value);
        }
    }, []);

    return (
        <BaseDefaultEditor
            documentModelEditor={selectedDefaultDocumentModelEditorId}
            setDocumentModelEditor={handleSetDocumentEditor}
            documentModelEditorOptions={
                documentModelEditorOptions as unknown as {
                    value: string;
                    label: string;
                }[]
            }
        />
    );
};
