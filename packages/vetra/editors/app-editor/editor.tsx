import { DocumentToolbar } from "@powerhousedao/design-system/connect";
import { useSetPHDocumentEditorConfig } from "@powerhousedao/reactor-browser";
import { AppEditorForm } from "./components/AppEditorForm.js";
import { editorConfig } from "./config.js";

export default function Editor() {
  useSetPHDocumentEditorConfig(editorConfig);

  return (
    <div>
      <DocumentToolbar />
      <AppEditorForm />
    </div>
  );
}
