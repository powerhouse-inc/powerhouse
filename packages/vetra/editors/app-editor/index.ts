import type { EditorModule } from "document-model";
import { Editor } from "./editor.js";

export const module: EditorModule = {
  Component: Editor,
  config: {
    id: "app-module-editor",
    name: "App Module Editor",
  },
  documentTypes: ["powerhouse/app"],
};

export default module;
