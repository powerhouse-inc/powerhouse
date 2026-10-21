import { DocumentToolbar } from "@powerhousedao/design-system/connect";
import type { EditorProps } from "@powerhousedao/shared/document-model";
import type {
  AppModuleAction,
  AppModuleDocument,
} from "../../document-models/app-module/index.js";
import { useSetPHDocumentEditorConfig } from "@powerhousedao/reactor-browser";
import { AppEditorForm } from "./components/AppEditorForm.js";
import { editorConfig } from "./config.js";

export default function Editor({
  document,
}: EditorProps<AppModuleDocument, AppModuleAction>) {
  useSetPHDocumentEditorConfig(editorConfig);

  return (
    <div className="bg-background p-6">
      <DocumentToolbar document={document} />
      <AppEditorForm />
    </div>
  );
}
