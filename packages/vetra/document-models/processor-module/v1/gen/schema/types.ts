export type Maybe<T> = T | null | undefined;
export type InputMaybe<T> = T | null | undefined;
export type Exact<T extends { [key: string]: unknown }> = {
  [K in keyof T]: T[K];
};
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & {
  [SubKey in K]?: Maybe<T[SubKey]>;
};
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & {
  [SubKey in K]: Maybe<T[SubKey]>;
};
export type MakeEmpty<
  T extends { [key: string]: unknown },
  K extends keyof T,
> = { [_ in K]?: never };
export type Incremental<T> =
  | T
  | {
      [P in keyof T]?: P extends " $fragmentName" | "__typename" ? T[P] : never;
    };
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string; output: string };
  String: { input: string; output: string };
  Boolean: { input: boolean; output: boolean };
  Int: { input: number; output: number };
  Float: { input: number; output: number };
  Address: { input: `${string}:0x${string}`; output: `${string}:0x${string}` };
  Amount: {
    input: { unit?: string; value?: number };
    output: { unit?: string; value?: number };
  };
  Amount_Crypto: {
    input: { unit: string; value: string };
    output: { unit: string; value: string };
  };
  Amount_Currency: {
    input: { unit: string; value: string };
    output: { unit: string; value: string };
  };
  Amount_Fiat: {
    input: { unit: string; value: number };
    output: { unit: string; value: number };
  };
  Amount_Money: { input: number; output: number };
  Amount_Percentage: { input: number; output: number };
  Amount_Tokens: { input: number; output: number };
  AttachmentRef: {
    input: `attachment://v${number}:${string}`;
    output: `attachment://v${number}:${string}`;
  };
  Currency: { input: string; output: string };
  Date: { input: string; output: string };
  DateTime: { input: string; output: string };
  EmailAddress: { input: string; output: string };
  EthereumAddress: { input: string; output: string };
  OID: { input: string; output: string };
  OLabel: { input: string; output: string };
  PHID: { input: string; output: string };
  URL: { input: string; output: string };
  Unknown: { input: unknown; output: unknown };
  Upload: { input: File; output: File };
};

export type AddDocumentTypeInput = {
  documentType: Scalars["String"]["input"];
  id: Scalars["OID"]["input"];
};

export type AddProcessorAppInput = {
  processorApp: Scalars["String"]["input"];
};

/** A document type id (e.g. 'my-org/invoice') attached to the processor with a stable entry id. */
export type DocumentTypeItem = {
  /** Document type id this processor subscribes to. */
  documentType: Scalars["String"]["output"];
  /** Stable identifier for the entry; used to remove it. */
  id: Scalars["OID"]["output"];
};

/**
 * Configuration for a processor contributed by the package. A processor receives
 * operations from documents of matching types and runs server-side logic (e.g.
 * building a read model, indexing, syncing to an external system).
 */
export type ProcessorModuleState = {
  /** Document types this processor subscribes to. Each entry has a stable id so it can be removed individually. */
  documentTypes: Array<DocumentTypeItem>;
  /** Display name of the processor. Also determines the generated folder name under `processors/`. */
  name: Scalars["String"]["output"];
  /** Drive-app names this processor is attached to. The processor runs in the context of each listed app. */
  processorApps: Array<Scalars["String"]["output"]>;
  /** Lifecycle status. While DRAFT the processor definition is editable and codegen is skipped; switching to CONFIRMED triggers scaffold generation. */
  status: StatusType;
  /** Processor implementation kind (e.g. 'read-model', 'relational-db'). Determines which scaffold codegen emits. */
  type: Scalars["String"]["output"];
};

export type RemoveDocumentTypeInput = {
  id: Scalars["OID"]["input"];
};

export type RemoveProcessorAppInput = {
  processorApp: Scalars["String"]["input"];
};

export type SetProcessorNameInput = {
  name: Scalars["String"]["input"];
};

export type SetProcessorStatusInput = {
  status: StatusType;
};

export type SetProcessorTypeInput = {
  type: Scalars["String"]["input"];
};

/**
 * Lifecycle status of a module definition.
 * - DRAFT: still being edited; codegen does not run.
 * - CONFIRMED: locked in; codegen produces the corresponding scaffold.
 */
export type StatusType = "CONFIRMED" | "DRAFT";
