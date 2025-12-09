import type { DocumentModelModule } from "document-model";
import { BillingStatement as BillingStatementV1 } from "./billing-statement/v1/module.js";
import { TestDoc as TestDocV1 } from "./test-doc/v1/module.js";
import { TestEmptyCodes as TestEmptyCodesV1 } from "./test-empty-codes/v1/module.js";

export const documentModels: DocumentModelModule<any>[] = [
  BillingStatementV1,
  TestDocV1,
  TestEmptyCodesV1,
];
