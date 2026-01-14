import type { DocumentModelModule } from "document-model";
import { TodoList } from "./todo-list/module.js";

export const documentModels: DocumentModelModule<any>[] = [
  TodoList,
];
