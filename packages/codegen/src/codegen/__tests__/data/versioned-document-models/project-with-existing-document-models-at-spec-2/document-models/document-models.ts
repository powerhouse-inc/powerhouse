import type { DocumentModelModule } from "document-model";
import { BillingStatement as BillingStatementV1 } from "./billing-statement/v1/module.js";
import { BillingStatement as BillingStatementV2 } from "./billing-statement/v2/module.js";
import { TestDoc as TestDocV1 } from "./test-doc/v1/module.js";
import { TestDoc as TestDocV2 } from "./test-doc/v2/module.js";

export const documentModels: DocumentModelModule<any>[] = [
  BillingStatementV1,
  BillingStatementV2,
  TestDocV1,
  TestDocV2,
];
