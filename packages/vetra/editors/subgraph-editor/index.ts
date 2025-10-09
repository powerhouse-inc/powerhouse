import type { EditorModule } from "document-model";
import { Editor } from "./editor.js";

export const module: EditorModule = {
  Component: Editor,
  config: {
    id: "subgraph-module-editor",
    name: "Subgraph Module Editor",
  },
  documentTypes: ["powerhouse/subgraph"],
};

export default module;
