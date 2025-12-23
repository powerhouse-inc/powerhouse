import type { DocumentModelModule } from "document-model";
import { Todo as TodoV1 } from "./todo/v1/module.js";
import { Todo as TodoV2 } from "./todo/v2/module.js";

export const documentModels: DocumentModelModule<any>[] = [TodoV1, TodoV2];
