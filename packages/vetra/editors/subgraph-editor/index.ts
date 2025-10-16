import type { EditorModule } from "document-model";
import { Editor } from "./editor.js";

export const module: EditorModule = {
  Component: Editor,
  documentTypes: ["powerhouse/subgraph"],
  config: {
    id: "subgraph-module-editor",
    name: "Subgraph Module Editor",
  },
};

export default module;
