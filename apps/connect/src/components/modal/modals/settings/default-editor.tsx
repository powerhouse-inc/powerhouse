import { useDefaultDocumentModelEditor } from '#hooks/useDefaultDocumentModelEditor/index';
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
    const [documentModelEditor, setDocumentModelEditor] =
        useDefaultDocumentModelEditor();

    const handleSetDocumentEditor = useCallback((value: string) => {
        const option = documentModelEditorOptions.find(dm => dm.value == value);
        if (option) {
            setDocumentModelEditor(option);
        }
    }, []);

    return (
        <BaseDefaultEditor
            documentModelEditor={documentModelEditor.value}
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
