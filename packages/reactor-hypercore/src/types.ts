import type { Operation } from "@powerhousedao/shared/document-model";

export type StoredOperation = Operation & {
  documentId: string;
  documentType: string;
  scope: string;
  branch: string;
};

export type HypercoreStoreOptions = {
  storagePath: string;
};
