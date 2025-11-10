import { DefaultEditor as BaseDefaultEditor } from "@powerhousedao/design-system/connect/components/modal/settings-modal-v2/default-editor";
import { useCallback, useState } from "react";

const documentModelEditorOptions = [
  { label: "V1", value: "document-model-editor" },
  { label: "V2", value: "document-model-editor-v2" },
] as const;

export const DefaultEditor: React.FC = () => {
  const [documentModelEditor, setDocumentModelEditor] = useState<
    (typeof documentModelEditorOptions)[number]
  >(documentModelEditorOptions[1]);

  const handleSetDocumentEditor = useCallback((value: string) => {
    const option = documentModelEditorOptions.find((dm) => dm.value == value);
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
