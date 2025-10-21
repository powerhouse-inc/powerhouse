import type { EditorModule } from "document-model";
import { Editor } from "./editor.js";

export const module: EditorModule = {
  Component: Editor,
  documentTypes: ["powerhouse/app"],
  config: {
    id: "app-module-editor",
    name: "App Module Editor",
  },
};

export default module;
