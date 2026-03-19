import { ts } from "@tmpl/core";

export const documentModelsTemplate = ts`
import type { DocumentModelModule } from "@powerhousedao/shared/document-model";

export const documentModels: DocumentModelModule[] = [];
`.raw;
