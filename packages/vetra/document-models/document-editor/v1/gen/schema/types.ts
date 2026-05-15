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
  Attachment: { input: string; output: string };
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

/**
 * Configuration for a document editor contributed by the package. The editor is
 * registered against every document type listed in `documentTypes`; Connect picks
 * the first matching editor when opening a document.
 */
export type DocumentEditorState = {
  /** Document types this editor can edit. Each entry has a stable id so it can be removed individually. */
  documentTypes: Array<DocumentTypeItem>;
  /** Display name of the editor. Also determines the generated folder name under `editors/`. */
  name: Scalars["String"]["output"];
  /** Lifecycle status. While DRAFT the editor definition is editable and codegen is skipped; switching to CONFIRMED triggers scaffold generation. */
  status: StatusType;
};

/** A document type id (e.g. 'powerhouse/document-drive') attached to the editor with a stable entry id. */
export type DocumentTypeItem = {
  /** Document type id this editor handles (e.g. 'my-org/invoice'). */
  documentType: Scalars["String"]["output"];
  /** Stable identifier for the entry; used to remove it. */
  id: Scalars["OID"]["output"];
};

export type RemoveDocumentTypeInput = {
  id: Scalars["OID"]["input"];
};

export type SetEditorNameInput = {
  name: Scalars["String"]["input"];
};

export type SetEditorStatusInput = {
  status: StatusType;
};

/**
 * Lifecycle status of a module definition.
 * - DRAFT: still being edited; codegen does not run.
 * - CONFIRMED: locked in; codegen produces the corresponding scaffold.
 */
export type StatusType = "CONFIRMED" | "DRAFT";
