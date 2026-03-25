import type { DocumentModelModule } from "document-model";
import { BillingStatement } from "./billing-statement/module.js";
import { TestDoc } from "./test-doc/module.js";

export const documentModels: DocumentModelModule<any>[] = [
  BillingStatement,
  TestDoc,
];
