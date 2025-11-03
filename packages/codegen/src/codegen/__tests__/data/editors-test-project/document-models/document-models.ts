import type { DocumentModelModule } from "document-model";
import { TestDoc } from "./test-doc/module.js";

export const documentModels: DocumentModelModule<any>[] = [TestDoc];
