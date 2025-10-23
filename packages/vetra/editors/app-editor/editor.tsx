import { DocumentToolbar } from "@powerhousedao/design-system";
import { useSetPHDocumentEditorConfig } from "@powerhousedao/reactor-browser";
import { AppEditorForm } from "./components/AppEditorForm.js";
import { editorConfig } from "./config.js";

export function Editor() {
  useSetPHDocumentEditorConfig(editorConfig);

  return (
    <div>
      <DocumentToolbar />
      <AppEditorForm />
    </div>
  );
}
