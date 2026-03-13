import type { Operation } from "document-model";

export type StoredOperation = Operation & {
  documentId: string;
  documentType: string;
  scope: string;
  branch: string;
};

export type HypercoreStoreOptions = {
  storagePath: string;
};
