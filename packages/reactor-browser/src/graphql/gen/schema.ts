import type { GraphQLClient, RequestOptions } from "graphql-request";
import { gql } from "graphql-tag";
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
type GraphQLClientRequestHeaders = RequestOptions["requestHeaders"];
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string; output: string };
  String: { input: string; output: string };
  Boolean: { input: boolean; output: boolean };
  Int: { input: number; output: number };
  Float: { input: number; output: number };
  DateTime: { input: string | Date; output: string | Date };
  JSONObject: { input: NonNullable<unknown>; output: NonNullable<unknown> };
};

export type Action = {
  readonly attachments?: Maybe<ReadonlyArray<Attachment>>;
  readonly context?: Maybe<ActionContext>;
  readonly id: Scalars["String"]["output"];
  readonly input: Scalars["JSONObject"]["output"];
  readonly scope: Scalars["String"]["output"];
  readonly timestampUtcMs: Scalars["String"]["output"];
  readonly type: Scalars["String"]["output"];
};

export type ActionContext = {
  readonly signer?: Maybe<ReactorSigner>;
};

export type ActionContextInput = {
  readonly signer?: InputMaybe<ReactorSignerInput>;
};

export type ActionInput = {
  readonly attachments?: InputMaybe<ReadonlyArray<AttachmentInput>>;
  readonly context?: InputMaybe<ActionContextInput>;
  readonly id: Scalars["String"]["input"];
  readonly input: Scalars["JSONObject"]["input"];
  readonly scope: Scalars["String"]["input"];
  readonly timestampUtcMs: Scalars["String"]["input"];
  readonly type: Scalars["String"]["input"];
};

export type Attachment = {
  readonly data: Scalars["String"]["output"];
  readonly extension?: Maybe<Scalars["String"]["output"]>;
  readonly fileName?: Maybe<Scalars["String"]["output"]>;
  readonly hash: Scalars["String"]["output"];
  readonly mimeType: Scalars["String"]["output"];
};

export type AttachmentInput = {
  readonly data: Scalars["String"]["input"];
  readonly extension?: InputMaybe<Scalars["String"]["input"]>;
  readonly fileName?: InputMaybe<Scalars["String"]["input"]>;
  readonly hash: Scalars["String"]["input"];
  readonly mimeType: Scalars["String"]["input"];
};

export type ChannelMeta = {
  readonly id: Scalars["String"]["output"];
};

export type ChannelMetaInput = {
  readonly id: Scalars["String"]["input"];
};

export type DeadLetterInfo = {
  readonly branch: Scalars["String"]["output"];
  readonly documentId: Scalars["String"]["output"];
  readonly error: Scalars["String"]["output"];
  readonly jobId: Scalars["String"]["output"];
  readonly operationCount: Scalars["Int"]["output"];
  readonly scopes: ReadonlyArray<Scalars["String"]["output"]>;
};

export type DocumentChangeContext = {
  readonly childId?: Maybe<Scalars["String"]["output"]>;
  readonly parentId?: Maybe<Scalars["String"]["output"]>;
};

export type DocumentChangeEvent = {
  readonly context?: Maybe<DocumentChangeContext>;
  readonly documents: ReadonlyArray<PhDocument>;
  readonly type: DocumentChangeType;
};

export enum DocumentChangeType {
  ChildAdded = "CHILD_ADDED",
  ChildRemoved = "CHILD_REMOVED",
  Created = "CREATED",
  Deleted = "DELETED",
  ParentAdded = "PARENT_ADDED",
  ParentRemoved = "PARENT_REMOVED",
  Updated = "UPDATED",
}

export type DocumentModelGlobalState = {
  readonly id: Scalars["String"]["output"];
  readonly name: Scalars["String"]["output"];
  readonly namespace?: Maybe<Scalars["String"]["output"]>;
  readonly specification: Scalars["JSONObject"]["output"];
  readonly version?: Maybe<Scalars["String"]["output"]>;
};

export type DocumentModelResultPage = {
  readonly cursor?: Maybe<Scalars["String"]["output"]>;
  readonly hasNextPage: Scalars["Boolean"]["output"];
  readonly hasPreviousPage: Scalars["Boolean"]["output"];
  readonly items: ReadonlyArray<DocumentModelGlobalState>;
  readonly totalCount: Scalars["Int"]["output"];
};

export type DocumentOperationsFilterInput = {
  readonly actionTypes?: InputMaybe<ReadonlyArray<Scalars["String"]["input"]>>;
  readonly branch?: InputMaybe<Scalars["String"]["input"]>;
  readonly scopes?: InputMaybe<ReadonlyArray<Scalars["String"]["input"]>>;
  readonly sinceRevision?: InputMaybe<Scalars["Int"]["input"]>;
  readonly timestampFrom?: InputMaybe<Scalars["String"]["input"]>;
  readonly timestampTo?: InputMaybe<Scalars["String"]["input"]>;
};

export type DocumentWithChildren = {
  readonly childIds: ReadonlyArray<Scalars["String"]["output"]>;
  readonly document: PhDocument;
};

export type JobChangeEvent = {
  readonly error?: Maybe<Scalars["String"]["output"]>;
  readonly jobId: Scalars["String"]["output"];
  readonly result: Scalars["JSONObject"]["output"];
  readonly status: Scalars["String"]["output"];
};

export type JobInfo = {
  readonly completedAt?: Maybe<Scalars["DateTime"]["output"]>;
  readonly createdAt: Scalars["DateTime"]["output"];
  readonly error?: Maybe<Scalars["String"]["output"]>;
  readonly id: Scalars["String"]["output"];
  readonly result: Scalars["JSONObject"]["output"];
  readonly status: Scalars["String"]["output"];
};

export type MoveRelationshipResult = {
  readonly source: PhDocument;
  readonly target: PhDocument;
};

export type Mutation = {
  readonly addRelationship: PhDocument;
  readonly createDocument: PhDocument;
  readonly createEmptyDocument: PhDocument;
  readonly deleteDocument: Scalars["Boolean"]["output"];
  readonly deleteDocuments: Scalars["Boolean"]["output"];
  readonly moveRelationship: MoveRelationshipResult;
  readonly mutateDocument: PhDocument;
  readonly mutateDocumentAsync: Scalars["String"]["output"];
  readonly pushSyncEnvelopes: Scalars["Boolean"]["output"];
  readonly removeRelationship: PhDocument;
  readonly renameDocument: PhDocument;
  readonly setPreferredEditor: PhDocument;
  readonly touchChannel: TouchChannelResult;
};

export type MutationAddRelationshipArgs = {
  branch?: InputMaybe<Scalars["String"]["input"]>;
  relationshipType: Scalars["String"]["input"];
  sourceIdentifier: Scalars["String"]["input"];
  targetIdentifier: Scalars["String"]["input"];
};

export type MutationCreateDocumentArgs = {
  document: Scalars["JSONObject"]["input"];
  parentIdentifier?: InputMaybe<Scalars["String"]["input"]>;
};

export type MutationCreateEmptyDocumentArgs = {
  documentType: Scalars["String"]["input"];
  parentIdentifier?: InputMaybe<Scalars["String"]["input"]>;
};

export type MutationDeleteDocumentArgs = {
  identifier: Scalars["String"]["input"];
  propagate?: InputMaybe<PropagationMode>;
};

export type MutationDeleteDocumentsArgs = {
  identifiers: ReadonlyArray<Scalars["String"]["input"]>;
  propagate?: InputMaybe<PropagationMode>;
};

export type MutationMoveRelationshipArgs = {
  branch?: InputMaybe<Scalars["String"]["input"]>;
  relationshipType: Scalars["String"]["input"];
  sourceParentIdentifier: Scalars["String"]["input"];
  targetIdentifier: Scalars["String"]["input"];
  targetParentIdentifier: Scalars["String"]["input"];
};

export type MutationMutateDocumentArgs = {
  actions: ReadonlyArray<Scalars["JSONObject"]["input"]>;
  documentIdentifier: Scalars["String"]["input"];
  view?: InputMaybe<ViewFilterInput>;
};

export type MutationMutateDocumentAsyncArgs = {
  actions: ReadonlyArray<Scalars["JSONObject"]["input"]>;
  documentIdentifier: Scalars["String"]["input"];
  view?: InputMaybe<ViewFilterInput>;
};

export type MutationPushSyncEnvelopesArgs = {
  envelopes: ReadonlyArray<SyncEnvelopeInput>;
};

export type MutationRemoveRelationshipArgs = {
  branch?: InputMaybe<Scalars["String"]["input"]>;
  relationshipType: Scalars["String"]["input"];
  sourceIdentifier: Scalars["String"]["input"];
  targetIdentifier: Scalars["String"]["input"];
};

export type MutationRenameDocumentArgs = {
  branch?: InputMaybe<Scalars["String"]["input"]>;
  documentIdentifier: Scalars["String"]["input"];
  name: Scalars["String"]["input"];
};

export type MutationSetPreferredEditorArgs = {
  branch?: InputMaybe<Scalars["String"]["input"]>;
  documentIdentifier: Scalars["String"]["input"];
  preferredEditor?: InputMaybe<Scalars["String"]["input"]>;
};

export type MutationTouchChannelArgs = {
  input: TouchChannelInput;
};

export type OperationContext = {
  readonly branch: Scalars["String"]["output"];
  readonly documentId: Scalars["String"]["output"];
  readonly documentType: Scalars["String"]["output"];
  readonly ordinal: Scalars["Int"]["output"];
  readonly scope: Scalars["String"]["output"];
};

export type OperationContextInput = {
  readonly branch: Scalars["String"]["input"];
  readonly documentId: Scalars["String"]["input"];
  readonly documentType: Scalars["String"]["input"];
  readonly ordinal: Scalars["Int"]["input"];
  readonly scope: Scalars["String"]["input"];
};

export type OperationInput = {
  readonly action: ActionInput;
  readonly error?: InputMaybe<Scalars["String"]["input"]>;
  readonly hash: Scalars["String"]["input"];
  readonly id?: InputMaybe<Scalars["String"]["input"]>;
  readonly index: Scalars["Int"]["input"];
  readonly skip: Scalars["Int"]["input"];
  readonly timestampUtcMs: Scalars["String"]["input"];
};

export type OperationWithContext = {
  readonly context: OperationContext;
  readonly operation: ReactorOperation;
};

export type OperationWithContextInput = {
  readonly context: OperationContextInput;
  readonly operation: OperationInput;
};

export type OperationsFilterInput = {
  readonly actionTypes?: InputMaybe<ReadonlyArray<Scalars["String"]["input"]>>;
  readonly branch?: InputMaybe<Scalars["String"]["input"]>;
  readonly documentId: Scalars["String"]["input"];
  readonly scopes?: InputMaybe<ReadonlyArray<Scalars["String"]["input"]>>;
  readonly sinceRevision?: InputMaybe<Scalars["Int"]["input"]>;
  readonly timestampFrom?: InputMaybe<Scalars["String"]["input"]>;
  readonly timestampTo?: InputMaybe<Scalars["String"]["input"]>;
};

export type PhDocument = {
  readonly createdAtUtcIso: Scalars["DateTime"]["output"];
  readonly documentType: Scalars["String"]["output"];
  readonly id: Scalars["String"]["output"];
  readonly lastModifiedAtUtcIso: Scalars["DateTime"]["output"];
  readonly name: Scalars["String"]["output"];
  readonly operations?: Maybe<ReactorOperationResultPage>;
  readonly preferredEditor?: Maybe<Scalars["String"]["output"]>;
  readonly revisionsList: ReadonlyArray<Revision>;
  readonly slug?: Maybe<Scalars["String"]["output"]>;
  readonly state: Scalars["JSONObject"]["output"];
};

export type PhDocumentOperationsArgs = {
  filter?: InputMaybe<DocumentOperationsFilterInput>;
  paging?: InputMaybe<PagingInput>;
};

export type PhDocumentResultPage = {
  readonly cursor?: Maybe<Scalars["String"]["output"]>;
  readonly hasNextPage: Scalars["Boolean"]["output"];
  readonly hasPreviousPage: Scalars["Boolean"]["output"];
  readonly items: ReadonlyArray<PhDocument>;
  readonly totalCount: Scalars["Int"]["output"];
};

export type PagingInput = {
  readonly cursor?: InputMaybe<Scalars["String"]["input"]>;
  readonly limit?: InputMaybe<Scalars["Int"]["input"]>;
  readonly offset?: InputMaybe<Scalars["Int"]["input"]>;
};

export type PollSyncEnvelopesResult = {
  readonly ackOrdinal: Scalars["Int"]["output"];
  readonly deadLetters: ReadonlyArray<DeadLetterInfo>;
  readonly envelopes: ReadonlyArray<SyncEnvelope>;
  readonly hasMore: Scalars["Boolean"]["output"];
};

export enum PropagationMode {
  Cascade = "CASCADE",
  Orphan = "ORPHAN",
}

export type Query = {
  readonly document?: Maybe<DocumentWithChildren>;
  readonly documentIncomingRelationships: PhDocumentResultPage;
  readonly documentModels: DocumentModelResultPage;
  readonly documentOperations: ReactorOperationResultPage;
  readonly documentOutgoingRelationships: PhDocumentResultPage;
  readonly findDocuments: PhDocumentResultPage;
  readonly jobStatus?: Maybe<JobInfo>;
  readonly pollSyncEnvelopes: PollSyncEnvelopesResult;
};

export type QueryDocumentArgs = {
  identifier: Scalars["String"]["input"];
  view?: InputMaybe<ViewFilterInput>;
};

export type QueryDocumentIncomingRelationshipsArgs = {
  paging?: InputMaybe<PagingInput>;
  relationshipType: Scalars["String"]["input"];
  targetIdentifier: Scalars["String"]["input"];
  view?: InputMaybe<ViewFilterInput>;
};

export type QueryDocumentModelsArgs = {
  namespace?: InputMaybe<Scalars["String"]["input"]>;
  paging?: InputMaybe<PagingInput>;
};

export type QueryDocumentOperationsArgs = {
  filter: OperationsFilterInput;
  paging?: InputMaybe<PagingInput>;
};

export type QueryDocumentOutgoingRelationshipsArgs = {
  paging?: InputMaybe<PagingInput>;
  relationshipType: Scalars["String"]["input"];
  sourceIdentifier: Scalars["String"]["input"];
  view?: InputMaybe<ViewFilterInput>;
};

export type QueryFindDocumentsArgs = {
  paging?: InputMaybe<PagingInput>;
  search?: InputMaybe<SearchFilterInput>;
  view?: InputMaybe<ViewFilterInput>;
};

export type QueryJobStatusArgs = {
  jobId: Scalars["String"]["input"];
};

export type QueryPollSyncEnvelopesArgs = {
  channelId: Scalars["String"]["input"];
  outboxAck: Scalars["Int"]["input"];
  outboxLatest: Scalars["Int"]["input"];
};

export type ReactorOperation = {
  readonly action: Action;
  readonly error?: Maybe<Scalars["String"]["output"]>;
  readonly hash: Scalars["String"]["output"];
  readonly id?: Maybe<Scalars["String"]["output"]>;
  readonly index: Scalars["Int"]["output"];
  readonly skip: Scalars["Int"]["output"];
  readonly timestampUtcMs: Scalars["String"]["output"];
};

export type ReactorOperationResultPage = {
  readonly cursor?: Maybe<Scalars["String"]["output"]>;
  readonly hasNextPage: Scalars["Boolean"]["output"];
  readonly hasPreviousPage: Scalars["Boolean"]["output"];
  readonly items: ReadonlyArray<ReactorOperation>;
  readonly totalCount: Scalars["Int"]["output"];
};

export type ReactorSigner = {
  readonly app?: Maybe<ReactorSignerApp>;
  readonly signatures: ReadonlyArray<Scalars["String"]["output"]>;
  readonly user?: Maybe<ReactorSignerUser>;
};

export type ReactorSignerApp = {
  readonly key: Scalars["String"]["output"];
  readonly name: Scalars["String"]["output"];
};

export type ReactorSignerAppInput = {
  readonly key: Scalars["String"]["input"];
  readonly name: Scalars["String"]["input"];
};

export type ReactorSignerInput = {
  readonly app?: InputMaybe<ReactorSignerAppInput>;
  readonly signatures: ReadonlyArray<Scalars["String"]["input"]>;
  readonly user?: InputMaybe<ReactorSignerUserInput>;
};

export type ReactorSignerUser = {
  readonly address: Scalars["String"]["output"];
  readonly chainId: Scalars["Int"]["output"];
  readonly networkId: Scalars["String"]["output"];
};

export type ReactorSignerUserInput = {
  readonly address: Scalars["String"]["input"];
  readonly chainId: Scalars["Int"]["input"];
  readonly networkId: Scalars["String"]["input"];
};

export type RemoteCursor = {
  readonly cursorOrdinal: Scalars["Int"]["output"];
  readonly lastSyncedAtUtcMs?: Maybe<Scalars["String"]["output"]>;
  readonly remoteName: Scalars["String"]["output"];
};

export type RemoteCursorInput = {
  readonly cursorOrdinal: Scalars["Int"]["input"];
  readonly lastSyncedAtUtcMs?: InputMaybe<Scalars["String"]["input"]>;
  readonly remoteName: Scalars["String"]["input"];
};

export type RemoteFilterInput = {
  readonly branch: Scalars["String"]["input"];
  readonly documentId: ReadonlyArray<Scalars["String"]["input"]>;
  readonly scope: ReadonlyArray<Scalars["String"]["input"]>;
};

export type Revision = {
  readonly revision: Scalars["Int"]["output"];
  readonly scope: Scalars["String"]["output"];
};

export type SearchFilterInput = {
  readonly identifiers?: InputMaybe<ReadonlyArray<Scalars["String"]["input"]>>;
  readonly parentId?: InputMaybe<Scalars["String"]["input"]>;
  readonly type?: InputMaybe<Scalars["String"]["input"]>;
};

export type Subscription = {
  readonly documentChanges: DocumentChangeEvent;
  readonly jobChanges: JobChangeEvent;
};

export type SubscriptionDocumentChangesArgs = {
  search?: InputMaybe<SearchFilterInput>;
  view?: InputMaybe<ViewFilterInput>;
};

export type SubscriptionJobChangesArgs = {
  jobId: Scalars["String"]["input"];
};

export type SyncEnvelope = {
  readonly channelMeta: ChannelMeta;
  readonly cursor?: Maybe<RemoteCursor>;
  readonly dependsOn?: Maybe<ReadonlyArray<Scalars["String"]["output"]>>;
  readonly key?: Maybe<Scalars["String"]["output"]>;
  readonly operations?: Maybe<ReadonlyArray<OperationWithContext>>;
  readonly type: SyncEnvelopeType;
};

export type SyncEnvelopeInput = {
  readonly channelMeta: ChannelMetaInput;
  readonly cursor?: InputMaybe<RemoteCursorInput>;
  readonly dependsOn?: InputMaybe<ReadonlyArray<Scalars["String"]["input"]>>;
  readonly key?: InputMaybe<Scalars["String"]["input"]>;
  readonly operations?: InputMaybe<ReadonlyArray<OperationWithContextInput>>;
  readonly type: SyncEnvelopeType;
};

export enum SyncEnvelopeType {
  Ack = "ACK",
  Operations = "OPERATIONS",
}

export type TouchChannelInput = {
  readonly collectionId: Scalars["String"]["input"];
  readonly filter: RemoteFilterInput;
  readonly id: Scalars["String"]["input"];
  readonly name: Scalars["String"]["input"];
  readonly sinceTimestampUtcMs: Scalars["String"]["input"];
};

export type TouchChannelResult = {
  readonly ackOrdinal: Scalars["Int"]["output"];
  readonly success: Scalars["Boolean"]["output"];
};

export type ViewFilterInput = {
  readonly branch?: InputMaybe<Scalars["String"]["input"]>;
  readonly scopes?: InputMaybe<ReadonlyArray<Scalars["String"]["input"]>>;
};

export type PhDocumentFieldsFragment = {
  readonly id: string;
  readonly slug?: string | null | undefined;
  readonly name: string;
  readonly documentType: string;
  readonly state: NonNullable<unknown>;
  readonly createdAtUtcIso: string | Date;
  readonly lastModifiedAtUtcIso: string | Date;
  readonly revisionsList: ReadonlyArray<{
    readonly scope: string;
    readonly revision: number;
  }>;
};

export type GetDocumentModelsQueryVariables = Exact<{
  namespace?: InputMaybe<Scalars["String"]["input"]>;
  paging?: InputMaybe<PagingInput>;
}>;

export type GetDocumentModelsQuery = {
  readonly documentModels: {
    readonly totalCount: number;
    readonly hasNextPage: boolean;
    readonly hasPreviousPage: boolean;
    readonly cursor?: string | null | undefined;
    readonly items: ReadonlyArray<{
      readonly id: string;
      readonly name: string;
      readonly namespace?: string | null | undefined;
      readonly version?: string | null | undefined;
      readonly specification: NonNullable<unknown>;
    }>;
  };
};

export type GetDocumentQueryVariables = Exact<{
  identifier: Scalars["String"]["input"];
  view?: InputMaybe<ViewFilterInput>;
}>;

export type GetDocumentQuery = {
  readonly document?:
    | {
        readonly childIds: ReadonlyArray<string>;
        readonly document: {
          readonly id: string;
          readonly slug?: string | null | undefined;
          readonly name: string;
          readonly documentType: string;
          readonly state: NonNullable<unknown>;
          readonly createdAtUtcIso: string | Date;
          readonly lastModifiedAtUtcIso: string | Date;
          readonly revisionsList: ReadonlyArray<{
            readonly scope: string;
            readonly revision: number;
          }>;
        };
      }
    | null
    | undefined;
};

export type GetDocumentWithOperationsQueryVariables = Exact<{
  identifier: Scalars["String"]["input"];
  view?: InputMaybe<ViewFilterInput>;
  operationsFilter?: InputMaybe<DocumentOperationsFilterInput>;
  operationsPaging?: InputMaybe<PagingInput>;
}>;

export type GetDocumentWithOperationsQuery = {
  readonly document?:
    | {
        readonly childIds: ReadonlyArray<string>;
        readonly document: {
          readonly id: string;
          readonly slug?: string | null | undefined;
          readonly name: string;
          readonly documentType: string;
          readonly state: NonNullable<unknown>;
          readonly createdAtUtcIso: string | Date;
          readonly lastModifiedAtUtcIso: string | Date;
          readonly operations?:
            | {
                readonly totalCount: number;
                readonly hasNextPage: boolean;
                readonly hasPreviousPage: boolean;
                readonly cursor?: string | null | undefined;
                readonly items: ReadonlyArray<{
                  readonly index: number;
                  readonly timestampUtcMs: string;
                  readonly hash: string;
                  readonly skip: number;
                  readonly error?: string | null | undefined;
                  readonly id?: string | null | undefined;
                  readonly action: {
                    readonly id: string;
                    readonly type: string;
                    readonly timestampUtcMs: string;
                    readonly input: NonNullable<unknown>;
                    readonly scope: string;
                    readonly attachments?:
                      | ReadonlyArray<{
                          readonly data: string;
                          readonly mimeType: string;
                          readonly hash: string;
                          readonly extension?: string | null | undefined;
                          readonly fileName?: string | null | undefined;
                        }>
                      | null
                      | undefined;
                    readonly context?:
                      | {
                          readonly signer?:
                            | {
                                readonly signatures: ReadonlyArray<string>;
                                readonly user?:
                                  | {
                                      readonly address: string;
                                      readonly networkId: string;
                                      readonly chainId: number;
                                    }
                                  | null
                                  | undefined;
                                readonly app?:
                                  | {
                                      readonly name: string;
                                      readonly key: string;
                                    }
                                  | null
                                  | undefined;
                              }
                            | null
                            | undefined;
                        }
                      | null
                      | undefined;
                  };
                }>;
              }
            | null
            | undefined;
          readonly revisionsList: ReadonlyArray<{
            readonly scope: string;
            readonly revision: number;
          }>;
        };
      }
    | null
    | undefined;
};

export type GetDocumentOutgoingRelationshipsQueryVariables = Exact<{
  sourceIdentifier: Scalars["String"]["input"];
  relationshipType: Scalars["String"]["input"];
  view?: InputMaybe<ViewFilterInput>;
  paging?: InputMaybe<PagingInput>;
}>;

export type GetDocumentOutgoingRelationshipsQuery = {
  readonly documentOutgoingRelationships: {
    readonly totalCount: number;
    readonly hasNextPage: boolean;
    readonly hasPreviousPage: boolean;
    readonly cursor?: string | null | undefined;
    readonly items: ReadonlyArray<{
      readonly id: string;
      readonly slug?: string | null | undefined;
      readonly name: string;
      readonly documentType: string;
      readonly state: NonNullable<unknown>;
      readonly createdAtUtcIso: string | Date;
      readonly lastModifiedAtUtcIso: string | Date;
      readonly revisionsList: ReadonlyArray<{
        readonly scope: string;
        readonly revision: number;
      }>;
    }>;
  };
};

export type GetDocumentIncomingRelationshipsQueryVariables = Exact<{
  targetIdentifier: Scalars["String"]["input"];
  relationshipType: Scalars["String"]["input"];
  view?: InputMaybe<ViewFilterInput>;
  paging?: InputMaybe<PagingInput>;
}>;

export type GetDocumentIncomingRelationshipsQuery = {
  readonly documentIncomingRelationships: {
    readonly totalCount: number;
    readonly hasNextPage: boolean;
    readonly hasPreviousPage: boolean;
    readonly cursor?: string | null | undefined;
    readonly items: ReadonlyArray<{
      readonly id: string;
      readonly slug?: string | null | undefined;
      readonly name: string;
      readonly documentType: string;
      readonly state: NonNullable<unknown>;
      readonly createdAtUtcIso: string | Date;
      readonly lastModifiedAtUtcIso: string | Date;
      readonly revisionsList: ReadonlyArray<{
        readonly scope: string;
        readonly revision: number;
      }>;
    }>;
  };
};

export type FindDocumentsQueryVariables = Exact<{
  search?: InputMaybe<SearchFilterInput>;
  view?: InputMaybe<ViewFilterInput>;
  paging?: InputMaybe<PagingInput>;
}>;

export type FindDocumentsQuery = {
  readonly findDocuments: {
    readonly totalCount: number;
    readonly hasNextPage: boolean;
    readonly hasPreviousPage: boolean;
    readonly cursor?: string | null | undefined;
    readonly items: ReadonlyArray<{
      readonly id: string;
      readonly slug?: string | null | undefined;
      readonly name: string;
      readonly documentType: string;
      readonly state: NonNullable<unknown>;
      readonly createdAtUtcIso: string | Date;
      readonly lastModifiedAtUtcIso: string | Date;
      readonly revisionsList: ReadonlyArray<{
        readonly scope: string;
        readonly revision: number;
      }>;
    }>;
  };
};

export type GetDocumentOperationsQueryVariables = Exact<{
  filter: OperationsFilterInput;
  paging?: InputMaybe<PagingInput>;
}>;

export type GetDocumentOperationsQuery = {
  readonly documentOperations: {
    readonly totalCount: number;
    readonly hasNextPage: boolean;
    readonly hasPreviousPage: boolean;
    readonly cursor?: string | null | undefined;
    readonly items: ReadonlyArray<{
      readonly index: number;
      readonly timestampUtcMs: string;
      readonly hash: string;
      readonly skip: number;
      readonly error?: string | null | undefined;
      readonly id?: string | null | undefined;
      readonly action: {
        readonly id: string;
        readonly type: string;
        readonly timestampUtcMs: string;
        readonly input: NonNullable<unknown>;
        readonly scope: string;
        readonly attachments?:
          | ReadonlyArray<{
              readonly data: string;
              readonly mimeType: string;
              readonly hash: string;
              readonly extension?: string | null | undefined;
              readonly fileName?: string | null | undefined;
            }>
          | null
          | undefined;
        readonly context?:
          | {
              readonly signer?:
                | {
                    readonly signatures: ReadonlyArray<string>;
                    readonly user?:
                      | {
                          readonly address: string;
                          readonly networkId: string;
                          readonly chainId: number;
                        }
                      | null
                      | undefined;
                    readonly app?:
                      | { readonly name: string; readonly key: string }
                      | null
                      | undefined;
                  }
                | null
                | undefined;
            }
          | null
          | undefined;
      };
    }>;
  };
};

export type GetJobStatusQueryVariables = Exact<{
  jobId: Scalars["String"]["input"];
}>;

export type GetJobStatusQuery = {
  readonly jobStatus?:
    | {
        readonly id: string;
        readonly status: string;
        readonly result: NonNullable<unknown>;
        readonly error?: string | null | undefined;
        readonly createdAt: string | Date;
        readonly completedAt?: string | Date | null | undefined;
      }
    | null
    | undefined;
};

export type CreateDocumentMutationVariables = Exact<{
  document: Scalars["JSONObject"]["input"];
  parentIdentifier?: InputMaybe<Scalars["String"]["input"]>;
}>;

export type CreateDocumentMutation = {
  readonly createDocument: {
    readonly id: string;
    readonly slug?: string | null | undefined;
    readonly name: string;
    readonly documentType: string;
    readonly state: NonNullable<unknown>;
    readonly createdAtUtcIso: string | Date;
    readonly lastModifiedAtUtcIso: string | Date;
    readonly revisionsList: ReadonlyArray<{
      readonly scope: string;
      readonly revision: number;
    }>;
  };
};

export type CreateEmptyDocumentMutationVariables = Exact<{
  documentType: Scalars["String"]["input"];
  parentIdentifier?: InputMaybe<Scalars["String"]["input"]>;
}>;

export type CreateEmptyDocumentMutation = {
  readonly createEmptyDocument: {
    readonly id: string;
    readonly slug?: string | null | undefined;
    readonly name: string;
    readonly documentType: string;
    readonly state: NonNullable<unknown>;
    readonly createdAtUtcIso: string | Date;
    readonly lastModifiedAtUtcIso: string | Date;
    readonly revisionsList: ReadonlyArray<{
      readonly scope: string;
      readonly revision: number;
    }>;
  };
};

export type MutateDocumentMutationVariables = Exact<{
  documentIdentifier: Scalars["String"]["input"];
  actions: ReadonlyArray<Scalars["JSONObject"]["input"]>;
  view?: InputMaybe<ViewFilterInput>;
}>;

export type MutateDocumentMutation = {
  readonly mutateDocument: {
    readonly id: string;
    readonly slug?: string | null | undefined;
    readonly name: string;
    readonly documentType: string;
    readonly state: NonNullable<unknown>;
    readonly createdAtUtcIso: string | Date;
    readonly lastModifiedAtUtcIso: string | Date;
    readonly revisionsList: ReadonlyArray<{
      readonly scope: string;
      readonly revision: number;
    }>;
  };
};

export type MutateDocumentAsyncMutationVariables = Exact<{
  documentIdentifier: Scalars["String"]["input"];
  actions: ReadonlyArray<Scalars["JSONObject"]["input"]>;
  view?: InputMaybe<ViewFilterInput>;
}>;

export type MutateDocumentAsyncMutation = {
  readonly mutateDocumentAsync: string;
};

export type RenameDocumentMutationVariables = Exact<{
  documentIdentifier: Scalars["String"]["input"];
  name: Scalars["String"]["input"];
  branch?: InputMaybe<Scalars["String"]["input"]>;
}>;

export type RenameDocumentMutation = {
  readonly renameDocument: {
    readonly id: string;
    readonly slug?: string | null | undefined;
    readonly name: string;
    readonly documentType: string;
    readonly state: NonNullable<unknown>;
    readonly createdAtUtcIso: string | Date;
    readonly lastModifiedAtUtcIso: string | Date;
    readonly revisionsList: ReadonlyArray<{
      readonly scope: string;
      readonly revision: number;
    }>;
  };
};

export type SetPreferredEditorMutationVariables = Exact<{
  documentIdentifier: Scalars["String"]["input"];
  preferredEditor?: InputMaybe<Scalars["String"]["input"]>;
  branch?: InputMaybe<Scalars["String"]["input"]>;
}>;

export type SetPreferredEditorMutation = {
  readonly setPreferredEditor: {
    readonly id: string;
    readonly slug?: string | null | undefined;
    readonly name: string;
    readonly documentType: string;
    readonly state: NonNullable<unknown>;
    readonly createdAtUtcIso: string | Date;
    readonly lastModifiedAtUtcIso: string | Date;
    readonly revisionsList: ReadonlyArray<{
      readonly scope: string;
      readonly revision: number;
    }>;
  };
};

export type AddRelationshipMutationVariables = Exact<{
  sourceIdentifier: Scalars["String"]["input"];
  targetIdentifier: Scalars["String"]["input"];
  relationshipType: Scalars["String"]["input"];
  branch?: InputMaybe<Scalars["String"]["input"]>;
}>;

export type AddRelationshipMutation = {
  readonly addRelationship: {
    readonly id: string;
    readonly slug?: string | null | undefined;
    readonly name: string;
    readonly documentType: string;
    readonly state: NonNullable<unknown>;
    readonly createdAtUtcIso: string | Date;
    readonly lastModifiedAtUtcIso: string | Date;
    readonly revisionsList: ReadonlyArray<{
      readonly scope: string;
      readonly revision: number;
    }>;
  };
};

export type RemoveRelationshipMutationVariables = Exact<{
  sourceIdentifier: Scalars["String"]["input"];
  targetIdentifier: Scalars["String"]["input"];
  relationshipType: Scalars["String"]["input"];
  branch?: InputMaybe<Scalars["String"]["input"]>;
}>;

export type RemoveRelationshipMutation = {
  readonly removeRelationship: {
    readonly id: string;
    readonly slug?: string | null | undefined;
    readonly name: string;
    readonly documentType: string;
    readonly state: NonNullable<unknown>;
    readonly createdAtUtcIso: string | Date;
    readonly lastModifiedAtUtcIso: string | Date;
    readonly revisionsList: ReadonlyArray<{
      readonly scope: string;
      readonly revision: number;
    }>;
  };
};

export type MoveRelationshipMutationVariables = Exact<{
  sourceParentIdentifier: Scalars["String"]["input"];
  targetParentIdentifier: Scalars["String"]["input"];
  targetIdentifier: Scalars["String"]["input"];
  relationshipType: Scalars["String"]["input"];
  branch?: InputMaybe<Scalars["String"]["input"]>;
}>;

export type MoveRelationshipMutation = {
  readonly moveRelationship: {
    readonly source: {
      readonly id: string;
      readonly slug?: string | null | undefined;
      readonly name: string;
      readonly documentType: string;
      readonly state: NonNullable<unknown>;
      readonly createdAtUtcIso: string | Date;
      readonly lastModifiedAtUtcIso: string | Date;
      readonly revisionsList: ReadonlyArray<{
        readonly scope: string;
        readonly revision: number;
      }>;
    };
    readonly target: {
      readonly id: string;
      readonly slug?: string | null | undefined;
      readonly name: string;
      readonly documentType: string;
      readonly state: NonNullable<unknown>;
      readonly createdAtUtcIso: string | Date;
      readonly lastModifiedAtUtcIso: string | Date;
      readonly revisionsList: ReadonlyArray<{
        readonly scope: string;
        readonly revision: number;
      }>;
    };
  };
};

export type DeleteDocumentMutationVariables = Exact<{
  identifier: Scalars["String"]["input"];
  propagate?: InputMaybe<PropagationMode>;
}>;

export type DeleteDocumentMutation = { readonly deleteDocument: boolean };

export type DeleteDocumentsMutationVariables = Exact<{
  identifiers: ReadonlyArray<Scalars["String"]["input"]>;
  propagate?: InputMaybe<PropagationMode>;
}>;

export type DeleteDocumentsMutation = { readonly deleteDocuments: boolean };

export type DocumentChangesSubscriptionVariables = Exact<{
  search?: InputMaybe<SearchFilterInput>;
  view?: InputMaybe<ViewFilterInput>;
}>;

export type DocumentChangesSubscription = {
  readonly documentChanges: {
    readonly type: DocumentChangeType;
    readonly documents: ReadonlyArray<{
      readonly id: string;
      readonly slug?: string | null | undefined;
      readonly name: string;
      readonly documentType: string;
      readonly state: NonNullable<unknown>;
      readonly createdAtUtcIso: string | Date;
      readonly lastModifiedAtUtcIso: string | Date;
      readonly revisionsList: ReadonlyArray<{
        readonly scope: string;
        readonly revision: number;
      }>;
    }>;
    readonly context?:
      | {
          readonly parentId?: string | null | undefined;
          readonly childId?: string | null | undefined;
        }
      | null
      | undefined;
  };
};

export type JobChangesSubscriptionVariables = Exact<{
  jobId: Scalars["String"]["input"];
}>;

export type JobChangesSubscription = {
  readonly jobChanges: {
    readonly jobId: string;
    readonly status: string;
    readonly result: NonNullable<unknown>;
    readonly error?: string | null | undefined;
  };
};

export type PollSyncEnvelopesQueryVariables = Exact<{
  channelId: Scalars["String"]["input"];
  outboxAck: Scalars["Int"]["input"];
  outboxLatest: Scalars["Int"]["input"];
}>;

export type PollSyncEnvelopesQuery = {
  readonly pollSyncEnvelopes: {
    readonly ackOrdinal: number;
    readonly hasMore: boolean;
    readonly envelopes: ReadonlyArray<{
      readonly type: SyncEnvelopeType;
      readonly key?: string | null | undefined;
      readonly dependsOn?: ReadonlyArray<string> | null | undefined;
      readonly channelMeta: { readonly id: string };
      readonly operations?:
        | ReadonlyArray<{
            readonly operation: {
              readonly index: number;
              readonly timestampUtcMs: string;
              readonly hash: string;
              readonly skip: number;
              readonly error?: string | null | undefined;
              readonly id?: string | null | undefined;
              readonly action: {
                readonly id: string;
                readonly type: string;
                readonly timestampUtcMs: string;
                readonly input: NonNullable<unknown>;
                readonly scope: string;
                readonly attachments?:
                  | ReadonlyArray<{
                      readonly data: string;
                      readonly mimeType: string;
                      readonly hash: string;
                      readonly extension?: string | null | undefined;
                      readonly fileName?: string | null | undefined;
                    }>
                  | null
                  | undefined;
                readonly context?:
                  | {
                      readonly signer?:
                        | {
                            readonly signatures: ReadonlyArray<string>;
                            readonly user?:
                              | {
                                  readonly address: string;
                                  readonly networkId: string;
                                  readonly chainId: number;
                                }
                              | null
                              | undefined;
                            readonly app?:
                              | { readonly name: string; readonly key: string }
                              | null
                              | undefined;
                          }
                        | null
                        | undefined;
                    }
                  | null
                  | undefined;
              };
            };
            readonly context: {
              readonly documentId: string;
              readonly documentType: string;
              readonly scope: string;
              readonly branch: string;
            };
          }>
        | null
        | undefined;
      readonly cursor?:
        | {
            readonly remoteName: string;
            readonly cursorOrdinal: number;
            readonly lastSyncedAtUtcMs?: string | null | undefined;
          }
        | null
        | undefined;
    }>;
    readonly deadLetters: ReadonlyArray<{
      readonly documentId: string;
      readonly error: string;
    }>;
  };
};

export type TouchChannelMutationVariables = Exact<{
  input: TouchChannelInput;
}>;

export type TouchChannelMutation = {
  readonly touchChannel: {
    readonly success: boolean;
    readonly ackOrdinal: number;
  };
};

export type PushSyncEnvelopesMutationVariables = Exact<{
  envelopes: ReadonlyArray<SyncEnvelopeInput>;
}>;

export type PushSyncEnvelopesMutation = { readonly pushSyncEnvelopes: boolean };

export const PhDocumentFieldsFragmentDoc = gql`
  fragment PHDocumentFields on PHDocument {
    id
    slug
    name
    documentType
    state
    revisionsList {
      scope
      revision
    }
    createdAtUtcIso
    lastModifiedAtUtcIso
  }
`;
export const GetDocumentModelsDocument = gql`
  query GetDocumentModels($namespace: String, $paging: PagingInput) {
    documentModels(namespace: $namespace, paging: $paging) {
      items {
        id
        name
        namespace
        version
        specification
      }
      totalCount
      hasNextPage
      hasPreviousPage
      cursor
    }
  }
`;
export const GetDocumentDocument = gql`
  query GetDocument($identifier: String!, $view: ViewFilterInput) {
    document(identifier: $identifier, view: $view) {
      document {
        ...PHDocumentFields
      }
      childIds
    }
  }
  ${PhDocumentFieldsFragmentDoc}
`;
export const GetDocumentWithOperationsDocument = gql`
  query GetDocumentWithOperations(
    $identifier: String!
    $view: ViewFilterInput
    $operationsFilter: DocumentOperationsFilterInput
    $operationsPaging: PagingInput
  ) {
    document(identifier: $identifier, view: $view) {
      document {
        ...PHDocumentFields
        operations(filter: $operationsFilter, paging: $operationsPaging) {
          items {
            index
            timestampUtcMs
            hash
            skip
            error
            id
            action {
              id
              type
              timestampUtcMs
              input
              scope
              attachments {
                data
                mimeType
                hash
                extension
                fileName
              }
              context {
                signer {
                  user {
                    address
                    networkId
                    chainId
                  }
                  app {
                    name
                    key
                  }
                  signatures
                }
              }
            }
          }
          totalCount
          hasNextPage
          hasPreviousPage
          cursor
        }
      }
      childIds
    }
  }
  ${PhDocumentFieldsFragmentDoc}
`;
export const GetDocumentOutgoingRelationshipsDocument = gql`
  query GetDocumentOutgoingRelationships(
    $sourceIdentifier: String!
    $relationshipType: String!
    $view: ViewFilterInput
    $paging: PagingInput
  ) {
    documentOutgoingRelationships(
      sourceIdentifier: $sourceIdentifier
      relationshipType: $relationshipType
      view: $view
      paging: $paging
    ) {
      items {
        ...PHDocumentFields
      }
      totalCount
      hasNextPage
      hasPreviousPage
      cursor
    }
  }
  ${PhDocumentFieldsFragmentDoc}
`;
export const GetDocumentIncomingRelationshipsDocument = gql`
  query GetDocumentIncomingRelationships(
    $targetIdentifier: String!
    $relationshipType: String!
    $view: ViewFilterInput
    $paging: PagingInput
  ) {
    documentIncomingRelationships(
      targetIdentifier: $targetIdentifier
      relationshipType: $relationshipType
      view: $view
      paging: $paging
    ) {
      items {
        ...PHDocumentFields
      }
      totalCount
      hasNextPage
      hasPreviousPage
      cursor
    }
  }
  ${PhDocumentFieldsFragmentDoc}
`;
export const FindDocumentsDocument = gql`
  query FindDocuments(
    $search: SearchFilterInput
    $view: ViewFilterInput
    $paging: PagingInput
  ) {
    findDocuments(search: $search, view: $view, paging: $paging) {
      items {
        ...PHDocumentFields
      }
      totalCount
      hasNextPage
      hasPreviousPage
      cursor
    }
  }
  ${PhDocumentFieldsFragmentDoc}
`;
export const GetDocumentOperationsDocument = gql`
  query GetDocumentOperations(
    $filter: OperationsFilterInput!
    $paging: PagingInput
  ) {
    documentOperations(filter: $filter, paging: $paging) {
      items {
        index
        timestampUtcMs
        hash
        skip
        error
        id
        action {
          id
          type
          timestampUtcMs
          input
          scope
          attachments {
            data
            mimeType
            hash
            extension
            fileName
          }
          context {
            signer {
              user {
                address
                networkId
                chainId
              }
              app {
                name
                key
              }
              signatures
            }
          }
        }
      }
      totalCount
      hasNextPage
      hasPreviousPage
      cursor
    }
  }
`;
export const GetJobStatusDocument = gql`
  query GetJobStatus($jobId: String!) {
    jobStatus(jobId: $jobId) {
      id
      status
      result
      error
      createdAt
      completedAt
    }
  }
`;
export const CreateDocumentDocument = gql`
  mutation CreateDocument($document: JSONObject!, $parentIdentifier: String) {
    createDocument(document: $document, parentIdentifier: $parentIdentifier) {
      ...PHDocumentFields
    }
  }
  ${PhDocumentFieldsFragmentDoc}
`;
export const CreateEmptyDocumentDocument = gql`
  mutation CreateEmptyDocument(
    $documentType: String!
    $parentIdentifier: String
  ) {
    createEmptyDocument(
      documentType: $documentType
      parentIdentifier: $parentIdentifier
    ) {
      ...PHDocumentFields
    }
  }
  ${PhDocumentFieldsFragmentDoc}
`;
export const MutateDocumentDocument = gql`
  mutation MutateDocument(
    $documentIdentifier: String!
    $actions: [JSONObject!]!
    $view: ViewFilterInput
  ) {
    mutateDocument(
      documentIdentifier: $documentIdentifier
      actions: $actions
      view: $view
    ) {
      ...PHDocumentFields
    }
  }
  ${PhDocumentFieldsFragmentDoc}
`;
export const MutateDocumentAsyncDocument = gql`
  mutation MutateDocumentAsync(
    $documentIdentifier: String!
    $actions: [JSONObject!]!
    $view: ViewFilterInput
  ) {
    mutateDocumentAsync(
      documentIdentifier: $documentIdentifier
      actions: $actions
      view: $view
    )
  }
`;
export const RenameDocumentDocument = gql`
  mutation RenameDocument(
    $documentIdentifier: String!
    $name: String!
    $branch: String
  ) {
    renameDocument(
      documentIdentifier: $documentIdentifier
      name: $name
      branch: $branch
    ) {
      ...PHDocumentFields
    }
  }
  ${PhDocumentFieldsFragmentDoc}
`;
export const SetPreferredEditorDocument = gql`
  mutation SetPreferredEditor(
    $documentIdentifier: String!
    $preferredEditor: String
    $branch: String
  ) {
    setPreferredEditor(
      documentIdentifier: $documentIdentifier
      preferredEditor: $preferredEditor
      branch: $branch
    ) {
      ...PHDocumentFields
    }
  }
  ${PhDocumentFieldsFragmentDoc}
`;
export const AddRelationshipDocument = gql`
  mutation AddRelationship(
    $sourceIdentifier: String!
    $targetIdentifier: String!
    $relationshipType: String!
    $branch: String
  ) {
    addRelationship(
      sourceIdentifier: $sourceIdentifier
      targetIdentifier: $targetIdentifier
      relationshipType: $relationshipType
      branch: $branch
    ) {
      ...PHDocumentFields
    }
  }
  ${PhDocumentFieldsFragmentDoc}
`;
export const RemoveRelationshipDocument = gql`
  mutation RemoveRelationship(
    $sourceIdentifier: String!
    $targetIdentifier: String!
    $relationshipType: String!
    $branch: String
  ) {
    removeRelationship(
      sourceIdentifier: $sourceIdentifier
      targetIdentifier: $targetIdentifier
      relationshipType: $relationshipType
      branch: $branch
    ) {
      ...PHDocumentFields
    }
  }
  ${PhDocumentFieldsFragmentDoc}
`;
export const MoveRelationshipDocument = gql`
  mutation MoveRelationship(
    $sourceParentIdentifier: String!
    $targetParentIdentifier: String!
    $targetIdentifier: String!
    $relationshipType: String!
    $branch: String
  ) {
    moveRelationship(
      sourceParentIdentifier: $sourceParentIdentifier
      targetParentIdentifier: $targetParentIdentifier
      targetIdentifier: $targetIdentifier
      relationshipType: $relationshipType
      branch: $branch
    ) {
      source {
        ...PHDocumentFields
      }
      target {
        ...PHDocumentFields
      }
    }
  }
  ${PhDocumentFieldsFragmentDoc}
`;
export const DeleteDocumentDocument = gql`
  mutation DeleteDocument($identifier: String!, $propagate: PropagationMode) {
    deleteDocument(identifier: $identifier, propagate: $propagate)
  }
`;
export const DeleteDocumentsDocument = gql`
  mutation DeleteDocuments(
    $identifiers: [String!]!
    $propagate: PropagationMode
  ) {
    deleteDocuments(identifiers: $identifiers, propagate: $propagate)
  }
`;
export const DocumentChangesDocument = gql`
  subscription DocumentChanges(
    $search: SearchFilterInput
    $view: ViewFilterInput
  ) {
    documentChanges(search: $search, view: $view) {
      type
      documents {
        ...PHDocumentFields
      }
      context {
        parentId
        childId
      }
    }
  }
  ${PhDocumentFieldsFragmentDoc}
`;
export const JobChangesDocument = gql`
  subscription JobChanges($jobId: String!) {
    jobChanges(jobId: $jobId) {
      jobId
      status
      result
      error
    }
  }
`;
export const PollSyncEnvelopesDocument = gql`
  query PollSyncEnvelopes(
    $channelId: String!
    $outboxAck: Int!
    $outboxLatest: Int!
  ) {
    pollSyncEnvelopes(
      channelId: $channelId
      outboxAck: $outboxAck
      outboxLatest: $outboxLatest
    ) {
      envelopes {
        type
        channelMeta {
          id
        }
        operations {
          operation {
            index
            timestampUtcMs
            hash
            skip
            error
            id
            action {
              id
              type
              timestampUtcMs
              input
              scope
              attachments {
                data
                mimeType
                hash
                extension
                fileName
              }
              context {
                signer {
                  user {
                    address
                    networkId
                    chainId
                  }
                  app {
                    name
                    key
                  }
                  signatures
                }
              }
            }
          }
          context {
            documentId
            documentType
            scope
            branch
          }
        }
        cursor {
          remoteName
          cursorOrdinal
          lastSyncedAtUtcMs
        }
        key
        dependsOn
      }
      ackOrdinal
      deadLetters {
        documentId
        error
      }
      hasMore
    }
  }
`;
export const TouchChannelDocument = gql`
  mutation TouchChannel($input: TouchChannelInput!) {
    touchChannel(input: $input) {
      success
      ackOrdinal
    }
  }
`;
export const PushSyncEnvelopesDocument = gql`
  mutation PushSyncEnvelopes($envelopes: [SyncEnvelopeInput!]!) {
    pushSyncEnvelopes(envelopes: $envelopes)
  }
`;

export type SdkFunctionWrapper = <T>(
  action: (requestHeaders?: Record<string, string>) => Promise<T>,
  operationName: string,
  operationType?: string,
  variables?: any,
) => Promise<T>;

const defaultWrapper: SdkFunctionWrapper = (
  action,
  _operationName,
  _operationType,
  _variables,
) => action();

export function getSdk(
  client: GraphQLClient,
  withWrapper: SdkFunctionWrapper = defaultWrapper,
) {
  return {
    GetDocumentModels(
      variables?: GetDocumentModelsQueryVariables,
      requestHeaders?: GraphQLClientRequestHeaders,
      signal?: RequestInit["signal"],
    ): Promise<GetDocumentModelsQuery> {
      return withWrapper(
        (wrappedRequestHeaders) =>
          client.request<GetDocumentModelsQuery>({
            document: GetDocumentModelsDocument,
            variables,
            requestHeaders: { ...requestHeaders, ...wrappedRequestHeaders },
            signal,
          }),
        "GetDocumentModels",
        "query",
        variables,
      );
    },
    GetDocument(
      variables: GetDocumentQueryVariables,
      requestHeaders?: GraphQLClientRequestHeaders,
      signal?: RequestInit["signal"],
    ): Promise<GetDocumentQuery> {
      return withWrapper(
        (wrappedRequestHeaders) =>
          client.request<GetDocumentQuery>({
            document: GetDocumentDocument,
            variables,
            requestHeaders: { ...requestHeaders, ...wrappedRequestHeaders },
            signal,
          }),
        "GetDocument",
        "query",
        variables,
      );
    },
    GetDocumentWithOperations(
      variables: GetDocumentWithOperationsQueryVariables,
      requestHeaders?: GraphQLClientRequestHeaders,
      signal?: RequestInit["signal"],
    ): Promise<GetDocumentWithOperationsQuery> {
      return withWrapper(
        (wrappedRequestHeaders) =>
          client.request<GetDocumentWithOperationsQuery>({
            document: GetDocumentWithOperationsDocument,
            variables,
            requestHeaders: { ...requestHeaders, ...wrappedRequestHeaders },
            signal,
          }),
        "GetDocumentWithOperations",
        "query",
        variables,
      );
    },
    GetDocumentOutgoingRelationships(
      variables: GetDocumentOutgoingRelationshipsQueryVariables,
      requestHeaders?: GraphQLClientRequestHeaders,
      signal?: RequestInit["signal"],
    ): Promise<GetDocumentOutgoingRelationshipsQuery> {
      return withWrapper(
        (wrappedRequestHeaders) =>
          client.request<GetDocumentOutgoingRelationshipsQuery>({
            document: GetDocumentOutgoingRelationshipsDocument,
            variables,
            requestHeaders: { ...requestHeaders, ...wrappedRequestHeaders },
            signal,
          }),
        "GetDocumentOutgoingRelationships",
        "query",
        variables,
      );
    },
    GetDocumentIncomingRelationships(
      variables: GetDocumentIncomingRelationshipsQueryVariables,
      requestHeaders?: GraphQLClientRequestHeaders,
      signal?: RequestInit["signal"],
    ): Promise<GetDocumentIncomingRelationshipsQuery> {
      return withWrapper(
        (wrappedRequestHeaders) =>
          client.request<GetDocumentIncomingRelationshipsQuery>({
            document: GetDocumentIncomingRelationshipsDocument,
            variables,
            requestHeaders: { ...requestHeaders, ...wrappedRequestHeaders },
            signal,
          }),
        "GetDocumentIncomingRelationships",
        "query",
        variables,
      );
    },
    FindDocuments(
      variables?: FindDocumentsQueryVariables,
      requestHeaders?: GraphQLClientRequestHeaders,
      signal?: RequestInit["signal"],
    ): Promise<FindDocumentsQuery> {
      return withWrapper(
        (wrappedRequestHeaders) =>
          client.request<FindDocumentsQuery>({
            document: FindDocumentsDocument,
            variables,
            requestHeaders: { ...requestHeaders, ...wrappedRequestHeaders },
            signal,
          }),
        "FindDocuments",
        "query",
        variables,
      );
    },
    GetDocumentOperations(
      variables: GetDocumentOperationsQueryVariables,
      requestHeaders?: GraphQLClientRequestHeaders,
      signal?: RequestInit["signal"],
    ): Promise<GetDocumentOperationsQuery> {
      return withWrapper(
        (wrappedRequestHeaders) =>
          client.request<GetDocumentOperationsQuery>({
            document: GetDocumentOperationsDocument,
            variables,
            requestHeaders: { ...requestHeaders, ...wrappedRequestHeaders },
            signal,
          }),
        "GetDocumentOperations",
        "query",
        variables,
      );
    },
    GetJobStatus(
      variables: GetJobStatusQueryVariables,
      requestHeaders?: GraphQLClientRequestHeaders,
      signal?: RequestInit["signal"],
    ): Promise<GetJobStatusQuery> {
      return withWrapper(
        (wrappedRequestHeaders) =>
          client.request<GetJobStatusQuery>({
            document: GetJobStatusDocument,
            variables,
            requestHeaders: { ...requestHeaders, ...wrappedRequestHeaders },
            signal,
          }),
        "GetJobStatus",
        "query",
        variables,
      );
    },
    CreateDocument(
      variables: CreateDocumentMutationVariables,
      requestHeaders?: GraphQLClientRequestHeaders,
      signal?: RequestInit["signal"],
    ): Promise<CreateDocumentMutation> {
      return withWrapper(
        (wrappedRequestHeaders) =>
          client.request<CreateDocumentMutation>({
            document: CreateDocumentDocument,
            variables,
            requestHeaders: { ...requestHeaders, ...wrappedRequestHeaders },
            signal,
          }),
        "CreateDocument",
        "mutation",
        variables,
      );
    },
    CreateEmptyDocument(
      variables: CreateEmptyDocumentMutationVariables,
      requestHeaders?: GraphQLClientRequestHeaders,
      signal?: RequestInit["signal"],
    ): Promise<CreateEmptyDocumentMutation> {
      return withWrapper(
        (wrappedRequestHeaders) =>
          client.request<CreateEmptyDocumentMutation>({
            document: CreateEmptyDocumentDocument,
            variables,
            requestHeaders: { ...requestHeaders, ...wrappedRequestHeaders },
            signal,
          }),
        "CreateEmptyDocument",
        "mutation",
        variables,
      );
    },
    MutateDocument(
      variables: MutateDocumentMutationVariables,
      requestHeaders?: GraphQLClientRequestHeaders,
      signal?: RequestInit["signal"],
    ): Promise<MutateDocumentMutation> {
      return withWrapper(
        (wrappedRequestHeaders) =>
          client.request<MutateDocumentMutation>({
            document: MutateDocumentDocument,
            variables,
            requestHeaders: { ...requestHeaders, ...wrappedRequestHeaders },
            signal,
          }),
        "MutateDocument",
        "mutation",
        variables,
      );
    },
    MutateDocumentAsync(
      variables: MutateDocumentAsyncMutationVariables,
      requestHeaders?: GraphQLClientRequestHeaders,
      signal?: RequestInit["signal"],
    ): Promise<MutateDocumentAsyncMutation> {
      return withWrapper(
        (wrappedRequestHeaders) =>
          client.request<MutateDocumentAsyncMutation>({
            document: MutateDocumentAsyncDocument,
            variables,
            requestHeaders: { ...requestHeaders, ...wrappedRequestHeaders },
            signal,
          }),
        "MutateDocumentAsync",
        "mutation",
        variables,
      );
    },
    RenameDocument(
      variables: RenameDocumentMutationVariables,
      requestHeaders?: GraphQLClientRequestHeaders,
      signal?: RequestInit["signal"],
    ): Promise<RenameDocumentMutation> {
      return withWrapper(
        (wrappedRequestHeaders) =>
          client.request<RenameDocumentMutation>({
            document: RenameDocumentDocument,
            variables,
            requestHeaders: { ...requestHeaders, ...wrappedRequestHeaders },
            signal,
          }),
        "RenameDocument",
        "mutation",
        variables,
      );
    },
    SetPreferredEditor(
      variables: SetPreferredEditorMutationVariables,
      requestHeaders?: GraphQLClientRequestHeaders,
      signal?: RequestInit["signal"],
    ): Promise<SetPreferredEditorMutation> {
      return withWrapper(
        (wrappedRequestHeaders) =>
          client.request<SetPreferredEditorMutation>({
            document: SetPreferredEditorDocument,
            variables,
            requestHeaders: { ...requestHeaders, ...wrappedRequestHeaders },
            signal,
          }),
        "SetPreferredEditor",
        "mutation",
        variables,
      );
    },
    AddRelationship(
      variables: AddRelationshipMutationVariables,
      requestHeaders?: GraphQLClientRequestHeaders,
      signal?: RequestInit["signal"],
    ): Promise<AddRelationshipMutation> {
      return withWrapper(
        (wrappedRequestHeaders) =>
          client.request<AddRelationshipMutation>({
            document: AddRelationshipDocument,
            variables,
            requestHeaders: { ...requestHeaders, ...wrappedRequestHeaders },
            signal,
          }),
        "AddRelationship",
        "mutation",
        variables,
      );
    },
    RemoveRelationship(
      variables: RemoveRelationshipMutationVariables,
      requestHeaders?: GraphQLClientRequestHeaders,
      signal?: RequestInit["signal"],
    ): Promise<RemoveRelationshipMutation> {
      return withWrapper(
        (wrappedRequestHeaders) =>
          client.request<RemoveRelationshipMutation>({
            document: RemoveRelationshipDocument,
            variables,
            requestHeaders: { ...requestHeaders, ...wrappedRequestHeaders },
            signal,
          }),
        "RemoveRelationship",
        "mutation",
        variables,
      );
    },
    MoveRelationship(
      variables: MoveRelationshipMutationVariables,
      requestHeaders?: GraphQLClientRequestHeaders,
      signal?: RequestInit["signal"],
    ): Promise<MoveRelationshipMutation> {
      return withWrapper(
        (wrappedRequestHeaders) =>
          client.request<MoveRelationshipMutation>({
            document: MoveRelationshipDocument,
            variables,
            requestHeaders: { ...requestHeaders, ...wrappedRequestHeaders },
            signal,
          }),
        "MoveRelationship",
        "mutation",
        variables,
      );
    },
    DeleteDocument(
      variables: DeleteDocumentMutationVariables,
      requestHeaders?: GraphQLClientRequestHeaders,
      signal?: RequestInit["signal"],
    ): Promise<DeleteDocumentMutation> {
      return withWrapper(
        (wrappedRequestHeaders) =>
          client.request<DeleteDocumentMutation>({
            document: DeleteDocumentDocument,
            variables,
            requestHeaders: { ...requestHeaders, ...wrappedRequestHeaders },
            signal,
          }),
        "DeleteDocument",
        "mutation",
        variables,
      );
    },
    DeleteDocuments(
      variables: DeleteDocumentsMutationVariables,
      requestHeaders?: GraphQLClientRequestHeaders,
      signal?: RequestInit["signal"],
    ): Promise<DeleteDocumentsMutation> {
      return withWrapper(
        (wrappedRequestHeaders) =>
          client.request<DeleteDocumentsMutation>({
            document: DeleteDocumentsDocument,
            variables,
            requestHeaders: { ...requestHeaders, ...wrappedRequestHeaders },
            signal,
          }),
        "DeleteDocuments",
        "mutation",
        variables,
      );
    },
    DocumentChanges(
      variables?: DocumentChangesSubscriptionVariables,
      requestHeaders?: GraphQLClientRequestHeaders,
      signal?: RequestInit["signal"],
    ): Promise<DocumentChangesSubscription> {
      return withWrapper(
        (wrappedRequestHeaders) =>
          client.request<DocumentChangesSubscription>({
            document: DocumentChangesDocument,
            variables,
            requestHeaders: { ...requestHeaders, ...wrappedRequestHeaders },
            signal,
          }),
        "DocumentChanges",
        "subscription",
        variables,
      );
    },
    JobChanges(
      variables: JobChangesSubscriptionVariables,
      requestHeaders?: GraphQLClientRequestHeaders,
      signal?: RequestInit["signal"],
    ): Promise<JobChangesSubscription> {
      return withWrapper(
        (wrappedRequestHeaders) =>
          client.request<JobChangesSubscription>({
            document: JobChangesDocument,
            variables,
            requestHeaders: { ...requestHeaders, ...wrappedRequestHeaders },
            signal,
          }),
        "JobChanges",
        "subscription",
        variables,
      );
    },
    PollSyncEnvelopes(
      variables: PollSyncEnvelopesQueryVariables,
      requestHeaders?: GraphQLClientRequestHeaders,
      signal?: RequestInit["signal"],
    ): Promise<PollSyncEnvelopesQuery> {
      return withWrapper(
        (wrappedRequestHeaders) =>
          client.request<PollSyncEnvelopesQuery>({
            document: PollSyncEnvelopesDocument,
            variables,
            requestHeaders: { ...requestHeaders, ...wrappedRequestHeaders },
            signal,
          }),
        "PollSyncEnvelopes",
        "query",
        variables,
      );
    },
    TouchChannel(
      variables: TouchChannelMutationVariables,
      requestHeaders?: GraphQLClientRequestHeaders,
      signal?: RequestInit["signal"],
    ): Promise<TouchChannelMutation> {
      return withWrapper(
        (wrappedRequestHeaders) =>
          client.request<TouchChannelMutation>({
            document: TouchChannelDocument,
            variables,
            requestHeaders: { ...requestHeaders, ...wrappedRequestHeaders },
            signal,
          }),
        "TouchChannel",
        "mutation",
        variables,
      );
    },
    PushSyncEnvelopes(
      variables: PushSyncEnvelopesMutationVariables,
      requestHeaders?: GraphQLClientRequestHeaders,
      signal?: RequestInit["signal"],
    ): Promise<PushSyncEnvelopesMutation> {
      return withWrapper(
        (wrappedRequestHeaders) =>
          client.request<PushSyncEnvelopesMutation>({
            document: PushSyncEnvelopesDocument,
            variables,
            requestHeaders: { ...requestHeaders, ...wrappedRequestHeaders },
            signal,
          }),
        "PushSyncEnvelopes",
        "mutation",
        variables,
      );
    },
  };
}
export type Sdk = ReturnType<typeof getSdk>;
