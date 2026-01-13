import { ts } from "@tmpl/core";

export const documentModelsTemplate = ts`
import type { DocumentModelModule } from "document-model";

export const documentModels: DocumentModelModule[] = [];
`.raw;
