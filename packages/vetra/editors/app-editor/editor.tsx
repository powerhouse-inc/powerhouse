import { useSetPHDocumentEditorConfig } from "@powerhousedao/reactor-browser";
import { AppEditorForm } from "./components/AppEditorForm.js";
import { editorConfig } from "./config.js";

export function Editor() {
  useSetPHDocumentEditorConfig(editorConfig);

  return <AppEditorForm />;
}
