import type { DocumentModelModule } from "document-model";
import { ToDoDocument } from "./to-do-document/module.js";

export const documentModels: DocumentModelModule<any>[] = [
  ToDoDocument,
];
