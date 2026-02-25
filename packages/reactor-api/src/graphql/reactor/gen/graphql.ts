import type {
  GraphQLResolveInfo,
  GraphQLScalarType,
  GraphQLScalarTypeConfig,
} from "graphql";
import type { Context } from "../../types.js";
import * as z from "zod";
import type { DocumentNode } from "graphql";
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
export type RequireFields<T, K extends keyof T> = Omit<T, K> & {
  [P in K]-?: NonNullable<T[P]>;
};
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

export type MoveChildrenResult = {
  readonly source: PhDocument;
  readonly target: PhDocument;
};

export type Mutation = {
  readonly addChildren: PhDocument;
  readonly createDocument: PhDocument;
  readonly createEmptyDocument: PhDocument;
  readonly deleteDocument: Scalars["Boolean"]["output"];
  readonly deleteDocuments: Scalars["Boolean"]["output"];
  readonly moveChildren: MoveChildrenResult;
  readonly mutateDocument: PhDocument;
  readonly mutateDocumentAsync: Scalars["String"]["output"];
  readonly pushSyncEnvelopes: Scalars["Boolean"]["output"];
  readonly removeChildren: PhDocument;
  readonly renameDocument: PhDocument;
  readonly touchChannel: Scalars["Boolean"]["output"];
};

export type MutationAddChildrenArgs = {
  branch?: InputMaybe<Scalars["String"]["input"]>;
  documentIdentifiers: ReadonlyArray<Scalars["String"]["input"]>;
  parentIdentifier: Scalars["String"]["input"];
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

export type MutationMoveChildrenArgs = {
  branch?: InputMaybe<Scalars["String"]["input"]>;
  documentIdentifiers: ReadonlyArray<Scalars["String"]["input"]>;
  sourceParentIdentifier: Scalars["String"]["input"];
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

export type MutationRemoveChildrenArgs = {
  branch?: InputMaybe<Scalars["String"]["input"]>;
  documentIdentifiers: ReadonlyArray<Scalars["String"]["input"]>;
  parentIdentifier: Scalars["String"]["input"];
};

export type MutationRenameDocumentArgs = {
  branch?: InputMaybe<Scalars["String"]["input"]>;
  documentIdentifier: Scalars["String"]["input"];
  name: Scalars["String"]["input"];
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
};

export enum PropagationMode {
  Cascade = "CASCADE",
  Orphan = "ORPHAN",
}

export type Query = {
  readonly document?: Maybe<DocumentWithChildren>;
  readonly documentChildren: PhDocumentResultPage;
  readonly documentModels: DocumentModelResultPage;
  readonly documentOperations: ReactorOperationResultPage;
  readonly documentParents: PhDocumentResultPage;
  readonly findDocuments: PhDocumentResultPage;
  readonly jobStatus?: Maybe<JobInfo>;
  readonly pollSyncEnvelopes: PollSyncEnvelopesResult;
};

export type QueryDocumentArgs = {
  identifier: Scalars["String"]["input"];
  view?: InputMaybe<ViewFilterInput>;
};

export type QueryDocumentChildrenArgs = {
  paging?: InputMaybe<PagingInput>;
  parentIdentifier: Scalars["String"]["input"];
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

export type QueryDocumentParentsArgs = {
  childIdentifier: Scalars["String"]["input"];
  paging?: InputMaybe<PagingInput>;
  view?: InputMaybe<ViewFilterInput>;
};

export type QueryFindDocumentsArgs = {
  paging?: InputMaybe<PagingInput>;
  search: SearchFilterInput;
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
  search: SearchFilterInput;
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

export type GetDocumentChildrenQueryVariables = Exact<{
  parentIdentifier: Scalars["String"]["input"];
  view?: InputMaybe<ViewFilterInput>;
  paging?: InputMaybe<PagingInput>;
}>;

export type GetDocumentChildrenQuery = {
  readonly documentChildren: {
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

export type GetDocumentParentsQueryVariables = Exact<{
  childIdentifier: Scalars["String"]["input"];
  view?: InputMaybe<ViewFilterInput>;
  paging?: InputMaybe<PagingInput>;
}>;

export type GetDocumentParentsQuery = {
  readonly documentParents: {
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
  search: SearchFilterInput;
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

export type AddChildrenMutationVariables = Exact<{
  parentIdentifier: Scalars["String"]["input"];
  documentIdentifiers: ReadonlyArray<Scalars["String"]["input"]>;
  branch?: InputMaybe<Scalars["String"]["input"]>;
}>;

export type AddChildrenMutation = {
  readonly addChildren: {
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

export type RemoveChildrenMutationVariables = Exact<{
  parentIdentifier: Scalars["String"]["input"];
  documentIdentifiers: ReadonlyArray<Scalars["String"]["input"]>;
  branch?: InputMaybe<Scalars["String"]["input"]>;
}>;

export type RemoveChildrenMutation = {
  readonly removeChildren: {
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

export type MoveChildrenMutationVariables = Exact<{
  sourceParentIdentifier: Scalars["String"]["input"];
  targetParentIdentifier: Scalars["String"]["input"];
  documentIdentifiers: ReadonlyArray<Scalars["String"]["input"]>;
  branch?: InputMaybe<Scalars["String"]["input"]>;
}>;

export type MoveChildrenMutation = {
  readonly moveChildren: {
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
  search: SearchFilterInput;
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

export type TouchChannelMutation = { readonly touchChannel: boolean };

export type PushSyncEnvelopesMutationVariables = Exact<{
  envelopes: ReadonlyArray<SyncEnvelopeInput>;
}>;

export type PushSyncEnvelopesMutation = { readonly pushSyncEnvelopes: boolean };

export type WithIndex<TObject> = TObject & Record<string, any>;
export type ResolversObject<TObject> = WithIndex<TObject>;

export type ResolverTypeWrapper<T> = Promise<T> | T;

export type ResolverWithResolve<TResult, TParent, TContext, TArgs> = {
  resolve: ResolverFn<TResult, TParent, TContext, TArgs>;
};
export type Resolver<
  TResult,
  TParent = Record<PropertyKey, never>,
  TContext = Record<PropertyKey, never>,
  TArgs = Record<PropertyKey, never>,
> =
  | ResolverFn<TResult, TParent, TContext, TArgs>
  | ResolverWithResolve<TResult, TParent, TContext, TArgs>;

export type ResolverFn<TResult, TParent, TContext, TArgs> = (
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo,
) => Promise<TResult> | TResult;

export type SubscriptionSubscribeFn<TResult, TParent, TContext, TArgs> = (
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo,
) => AsyncIterable<TResult> | Promise<AsyncIterable<TResult>>;

export type SubscriptionResolveFn<TResult, TParent, TContext, TArgs> = (
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo,
) => TResult | Promise<TResult>;

export interface SubscriptionSubscriberObject<
  TResult,
  TKey extends string,
  TParent,
  TContext,
  TArgs,
> {
  subscribe: SubscriptionSubscribeFn<
    { [key in TKey]: TResult },
    TParent,
    TContext,
    TArgs
  >;
  resolve?: SubscriptionResolveFn<
    TResult,
    { [key in TKey]: TResult },
    TContext,
    TArgs
  >;
}

export interface SubscriptionResolverObject<TResult, TParent, TContext, TArgs> {
  subscribe: SubscriptionSubscribeFn<any, TParent, TContext, TArgs>;
  resolve: SubscriptionResolveFn<TResult, any, TContext, TArgs>;
}

export type SubscriptionObject<
  TResult,
  TKey extends string,
  TParent,
  TContext,
  TArgs,
> =
  | SubscriptionSubscriberObject<TResult, TKey, TParent, TContext, TArgs>
  | SubscriptionResolverObject<TResult, TParent, TContext, TArgs>;

export type SubscriptionResolver<
  TResult,
  TKey extends string,
  TParent = Record<PropertyKey, never>,
  TContext = Record<PropertyKey, never>,
  TArgs = Record<PropertyKey, never>,
> =
  | ((
      ...args: any[]
    ) => SubscriptionObject<TResult, TKey, TParent, TContext, TArgs>)
  | SubscriptionObject<TResult, TKey, TParent, TContext, TArgs>;

export type TypeResolveFn<
  TTypes,
  TParent = Record<PropertyKey, never>,
  TContext = Record<PropertyKey, never>,
> = (
  parent: TParent,
  context: TContext,
  info: GraphQLResolveInfo,
) => Maybe<TTypes> | Promise<Maybe<TTypes>>;

export type IsTypeOfResolverFn<
  T = Record<PropertyKey, never>,
  TContext = Record<PropertyKey, never>,
> = (
  obj: T,
  context: TContext,
  info: GraphQLResolveInfo,
) => boolean | Promise<boolean>;

export type NextResolverFn<T> = () => Promise<T>;

export type DirectiveResolverFn<
  TResult = Record<PropertyKey, never>,
  TParent = Record<PropertyKey, never>,
  TContext = Record<PropertyKey, never>,
  TArgs = Record<PropertyKey, never>,
> = (
  next: NextResolverFn<TResult>,
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo,
) => TResult | Promise<TResult>;

/** Mapping between all available schema types and the resolvers types */
export type ResolversTypes = ResolversObject<{
  Action: ResolverTypeWrapper<Action>;
  ActionContext: ResolverTypeWrapper<ActionContext>;
  ActionContextInput: ActionContextInput;
  ActionInput: ActionInput;
  Attachment: ResolverTypeWrapper<Attachment>;
  AttachmentInput: AttachmentInput;
  Boolean: ResolverTypeWrapper<Scalars["Boolean"]["output"]>;
  ChannelMeta: ResolverTypeWrapper<ChannelMeta>;
  ChannelMetaInput: ChannelMetaInput;
  DateTime: ResolverTypeWrapper<Scalars["DateTime"]["output"]>;
  DeadLetterInfo: ResolverTypeWrapper<DeadLetterInfo>;
  DocumentChangeContext: ResolverTypeWrapper<DocumentChangeContext>;
  DocumentChangeEvent: ResolverTypeWrapper<DocumentChangeEvent>;
  DocumentChangeType: DocumentChangeType;
  DocumentModelGlobalState: ResolverTypeWrapper<DocumentModelGlobalState>;
  DocumentModelResultPage: ResolverTypeWrapper<DocumentModelResultPage>;
  DocumentOperationsFilterInput: DocumentOperationsFilterInput;
  DocumentWithChildren: ResolverTypeWrapper<DocumentWithChildren>;
  Int: ResolverTypeWrapper<Scalars["Int"]["output"]>;
  JSONObject: ResolverTypeWrapper<Scalars["JSONObject"]["output"]>;
  JobChangeEvent: ResolverTypeWrapper<JobChangeEvent>;
  JobInfo: ResolverTypeWrapper<JobInfo>;
  MoveChildrenResult: ResolverTypeWrapper<MoveChildrenResult>;
  Mutation: ResolverTypeWrapper<Record<PropertyKey, never>>;
  OperationContext: ResolverTypeWrapper<OperationContext>;
  OperationContextInput: OperationContextInput;
  OperationInput: OperationInput;
  OperationWithContext: ResolverTypeWrapper<OperationWithContext>;
  OperationWithContextInput: OperationWithContextInput;
  OperationsFilterInput: OperationsFilterInput;
  PHDocument: ResolverTypeWrapper<PhDocument>;
  PHDocumentResultPage: ResolverTypeWrapper<PhDocumentResultPage>;
  PagingInput: PagingInput;
  PollSyncEnvelopesResult: ResolverTypeWrapper<PollSyncEnvelopesResult>;
  PropagationMode: PropagationMode;
  Query: ResolverTypeWrapper<Record<PropertyKey, never>>;
  ReactorOperation: ResolverTypeWrapper<ReactorOperation>;
  ReactorOperationResultPage: ResolverTypeWrapper<ReactorOperationResultPage>;
  ReactorSigner: ResolverTypeWrapper<ReactorSigner>;
  ReactorSignerApp: ResolverTypeWrapper<ReactorSignerApp>;
  ReactorSignerAppInput: ReactorSignerAppInput;
  ReactorSignerInput: ReactorSignerInput;
  ReactorSignerUser: ResolverTypeWrapper<ReactorSignerUser>;
  ReactorSignerUserInput: ReactorSignerUserInput;
  RemoteCursor: ResolverTypeWrapper<RemoteCursor>;
  RemoteCursorInput: RemoteCursorInput;
  RemoteFilterInput: RemoteFilterInput;
  Revision: ResolverTypeWrapper<Revision>;
  SearchFilterInput: SearchFilterInput;
  String: ResolverTypeWrapper<Scalars["String"]["output"]>;
  Subscription: ResolverTypeWrapper<Record<PropertyKey, never>>;
  SyncEnvelope: ResolverTypeWrapper<SyncEnvelope>;
  SyncEnvelopeInput: SyncEnvelopeInput;
  SyncEnvelopeType: SyncEnvelopeType;
  TouchChannelInput: TouchChannelInput;
  ViewFilterInput: ViewFilterInput;
}>;

/** Mapping between all available schema types and the resolvers parents */
export type ResolversParentTypes = ResolversObject<{
  Action: Action;
  ActionContext: ActionContext;
  ActionContextInput: ActionContextInput;
  ActionInput: ActionInput;
  Attachment: Attachment;
  AttachmentInput: AttachmentInput;
  Boolean: Scalars["Boolean"]["output"];
  ChannelMeta: ChannelMeta;
  ChannelMetaInput: ChannelMetaInput;
  DateTime: Scalars["DateTime"]["output"];
  DeadLetterInfo: DeadLetterInfo;
  DocumentChangeContext: DocumentChangeContext;
  DocumentChangeEvent: DocumentChangeEvent;
  DocumentModelGlobalState: DocumentModelGlobalState;
  DocumentModelResultPage: DocumentModelResultPage;
  DocumentOperationsFilterInput: DocumentOperationsFilterInput;
  DocumentWithChildren: DocumentWithChildren;
  Int: Scalars["Int"]["output"];
  JSONObject: Scalars["JSONObject"]["output"];
  JobChangeEvent: JobChangeEvent;
  JobInfo: JobInfo;
  MoveChildrenResult: MoveChildrenResult;
  Mutation: Record<PropertyKey, never>;
  OperationContext: OperationContext;
  OperationContextInput: OperationContextInput;
  OperationInput: OperationInput;
  OperationWithContext: OperationWithContext;
  OperationWithContextInput: OperationWithContextInput;
  OperationsFilterInput: OperationsFilterInput;
  PHDocument: PhDocument;
  PHDocumentResultPage: PhDocumentResultPage;
  PagingInput: PagingInput;
  PollSyncEnvelopesResult: PollSyncEnvelopesResult;
  Query: Record<PropertyKey, never>;
  ReactorOperation: ReactorOperation;
  ReactorOperationResultPage: ReactorOperationResultPage;
  ReactorSigner: ReactorSigner;
  ReactorSignerApp: ReactorSignerApp;
  ReactorSignerAppInput: ReactorSignerAppInput;
  ReactorSignerInput: ReactorSignerInput;
  ReactorSignerUser: ReactorSignerUser;
  ReactorSignerUserInput: ReactorSignerUserInput;
  RemoteCursor: RemoteCursor;
  RemoteCursorInput: RemoteCursorInput;
  RemoteFilterInput: RemoteFilterInput;
  Revision: Revision;
  SearchFilterInput: SearchFilterInput;
  String: Scalars["String"]["output"];
  Subscription: Record<PropertyKey, never>;
  SyncEnvelope: SyncEnvelope;
  SyncEnvelopeInput: SyncEnvelopeInput;
  TouchChannelInput: TouchChannelInput;
  ViewFilterInput: ViewFilterInput;
}>;

export type ActionResolvers<
  ContextType = Context,
  ParentType extends ResolversParentTypes["Action"] =
    ResolversParentTypes["Action"],
> = ResolversObject<{
  attachments?: Resolver<
    Maybe<ReadonlyArray<ResolversTypes["Attachment"]>>,
    ParentType,
    ContextType
  >;
  context?: Resolver<
    Maybe<ResolversTypes["ActionContext"]>,
    ParentType,
    ContextType
  >;
  id?: Resolver<ResolversTypes["String"], ParentType, ContextType>;
  input?: Resolver<ResolversTypes["JSONObject"], ParentType, ContextType>;
  scope?: Resolver<ResolversTypes["String"], ParentType, ContextType>;
  timestampUtcMs?: Resolver<ResolversTypes["String"], ParentType, ContextType>;
  type?: Resolver<ResolversTypes["String"], ParentType, ContextType>;
}>;

export type ActionContextResolvers<
  ContextType = Context,
  ParentType extends ResolversParentTypes["ActionContext"] =
    ResolversParentTypes["ActionContext"],
> = ResolversObject<{
  signer?: Resolver<
    Maybe<ResolversTypes["ReactorSigner"]>,
    ParentType,
    ContextType
  >;
}>;

export type AttachmentResolvers<
  ContextType = Context,
  ParentType extends ResolversParentTypes["Attachment"] =
    ResolversParentTypes["Attachment"],
> = ResolversObject<{
  data?: Resolver<ResolversTypes["String"], ParentType, ContextType>;
  extension?: Resolver<
    Maybe<ResolversTypes["String"]>,
    ParentType,
    ContextType
  >;
  fileName?: Resolver<Maybe<ResolversTypes["String"]>, ParentType, ContextType>;
  hash?: Resolver<ResolversTypes["String"], ParentType, ContextType>;
  mimeType?: Resolver<ResolversTypes["String"], ParentType, ContextType>;
}>;

export type ChannelMetaResolvers<
  ContextType = Context,
  ParentType extends ResolversParentTypes["ChannelMeta"] =
    ResolversParentTypes["ChannelMeta"],
> = ResolversObject<{
  id?: Resolver<ResolversTypes["String"], ParentType, ContextType>;
}>;

export interface DateTimeScalarConfig extends GraphQLScalarTypeConfig<
  ResolversTypes["DateTime"],
  any
> {
  name: "DateTime";
}

export type DeadLetterInfoResolvers<
  ContextType = Context,
  ParentType extends ResolversParentTypes["DeadLetterInfo"] =
    ResolversParentTypes["DeadLetterInfo"],
> = ResolversObject<{
  branch?: Resolver<ResolversTypes["String"], ParentType, ContextType>;
  documentId?: Resolver<ResolversTypes["String"], ParentType, ContextType>;
  error?: Resolver<ResolversTypes["String"], ParentType, ContextType>;
  jobId?: Resolver<ResolversTypes["String"], ParentType, ContextType>;
  operationCount?: Resolver<ResolversTypes["Int"], ParentType, ContextType>;
  scopes?: Resolver<
    ReadonlyArray<ResolversTypes["String"]>,
    ParentType,
    ContextType
  >;
}>;

export type DocumentChangeContextResolvers<
  ContextType = Context,
  ParentType extends ResolversParentTypes["DocumentChangeContext"] =
    ResolversParentTypes["DocumentChangeContext"],
> = ResolversObject<{
  childId?: Resolver<Maybe<ResolversTypes["String"]>, ParentType, ContextType>;
  parentId?: Resolver<Maybe<ResolversTypes["String"]>, ParentType, ContextType>;
}>;

export type DocumentChangeEventResolvers<
  ContextType = Context,
  ParentType extends ResolversParentTypes["DocumentChangeEvent"] =
    ResolversParentTypes["DocumentChangeEvent"],
> = ResolversObject<{
  context?: Resolver<
    Maybe<ResolversTypes["DocumentChangeContext"]>,
    ParentType,
    ContextType
  >;
  documents?: Resolver<
    ReadonlyArray<ResolversTypes["PHDocument"]>,
    ParentType,
    ContextType
  >;
  type?: Resolver<
    ResolversTypes["DocumentChangeType"],
    ParentType,
    ContextType
  >;
}>;

export type DocumentModelGlobalStateResolvers<
  ContextType = Context,
  ParentType extends ResolversParentTypes["DocumentModelGlobalState"] =
    ResolversParentTypes["DocumentModelGlobalState"],
> = ResolversObject<{
  id?: Resolver<ResolversTypes["String"], ParentType, ContextType>;
  name?: Resolver<ResolversTypes["String"], ParentType, ContextType>;
  namespace?: Resolver<
    Maybe<ResolversTypes["String"]>,
    ParentType,
    ContextType
  >;
  specification?: Resolver<
    ResolversTypes["JSONObject"],
    ParentType,
    ContextType
  >;
  version?: Resolver<Maybe<ResolversTypes["String"]>, ParentType, ContextType>;
}>;

export type DocumentModelResultPageResolvers<
  ContextType = Context,
  ParentType extends ResolversParentTypes["DocumentModelResultPage"] =
    ResolversParentTypes["DocumentModelResultPage"],
> = ResolversObject<{
  cursor?: Resolver<Maybe<ResolversTypes["String"]>, ParentType, ContextType>;
  hasNextPage?: Resolver<ResolversTypes["Boolean"], ParentType, ContextType>;
  hasPreviousPage?: Resolver<
    ResolversTypes["Boolean"],
    ParentType,
    ContextType
  >;
  items?: Resolver<
    ReadonlyArray<ResolversTypes["DocumentModelGlobalState"]>,
    ParentType,
    ContextType
  >;
  totalCount?: Resolver<ResolversTypes["Int"], ParentType, ContextType>;
}>;

export type DocumentWithChildrenResolvers<
  ContextType = Context,
  ParentType extends ResolversParentTypes["DocumentWithChildren"] =
    ResolversParentTypes["DocumentWithChildren"],
> = ResolversObject<{
  childIds?: Resolver<
    ReadonlyArray<ResolversTypes["String"]>,
    ParentType,
    ContextType
  >;
  document?: Resolver<ResolversTypes["PHDocument"], ParentType, ContextType>;
}>;

export interface JsonObjectScalarConfig extends GraphQLScalarTypeConfig<
  ResolversTypes["JSONObject"],
  any
> {
  name: "JSONObject";
}

export type JobChangeEventResolvers<
  ContextType = Context,
  ParentType extends ResolversParentTypes["JobChangeEvent"] =
    ResolversParentTypes["JobChangeEvent"],
> = ResolversObject<{
  error?: Resolver<Maybe<ResolversTypes["String"]>, ParentType, ContextType>;
  jobId?: Resolver<ResolversTypes["String"], ParentType, ContextType>;
  result?: Resolver<ResolversTypes["JSONObject"], ParentType, ContextType>;
  status?: Resolver<ResolversTypes["String"], ParentType, ContextType>;
}>;

export type JobInfoResolvers<
  ContextType = Context,
  ParentType extends ResolversParentTypes["JobInfo"] =
    ResolversParentTypes["JobInfo"],
> = ResolversObject<{
  completedAt?: Resolver<
    Maybe<ResolversTypes["DateTime"]>,
    ParentType,
    ContextType
  >;
  createdAt?: Resolver<ResolversTypes["DateTime"], ParentType, ContextType>;
  error?: Resolver<Maybe<ResolversTypes["String"]>, ParentType, ContextType>;
  id?: Resolver<ResolversTypes["String"], ParentType, ContextType>;
  result?: Resolver<ResolversTypes["JSONObject"], ParentType, ContextType>;
  status?: Resolver<ResolversTypes["String"], ParentType, ContextType>;
}>;

export type MoveChildrenResultResolvers<
  ContextType = Context,
  ParentType extends ResolversParentTypes["MoveChildrenResult"] =
    ResolversParentTypes["MoveChildrenResult"],
> = ResolversObject<{
  source?: Resolver<ResolversTypes["PHDocument"], ParentType, ContextType>;
  target?: Resolver<ResolversTypes["PHDocument"], ParentType, ContextType>;
}>;

export type MutationResolvers<
  ContextType = Context,
  ParentType extends ResolversParentTypes["Mutation"] =
    ResolversParentTypes["Mutation"],
> = ResolversObject<{
  addChildren?: Resolver<
    ResolversTypes["PHDocument"],
    ParentType,
    ContextType,
    RequireFields<
      MutationAddChildrenArgs,
      "documentIdentifiers" | "parentIdentifier"
    >
  >;
  createDocument?: Resolver<
    ResolversTypes["PHDocument"],
    ParentType,
    ContextType,
    RequireFields<MutationCreateDocumentArgs, "document">
  >;
  createEmptyDocument?: Resolver<
    ResolversTypes["PHDocument"],
    ParentType,
    ContextType,
    RequireFields<MutationCreateEmptyDocumentArgs, "documentType">
  >;
  deleteDocument?: Resolver<
    ResolversTypes["Boolean"],
    ParentType,
    ContextType,
    RequireFields<MutationDeleteDocumentArgs, "identifier">
  >;
  deleteDocuments?: Resolver<
    ResolversTypes["Boolean"],
    ParentType,
    ContextType,
    RequireFields<MutationDeleteDocumentsArgs, "identifiers">
  >;
  moveChildren?: Resolver<
    ResolversTypes["MoveChildrenResult"],
    ParentType,
    ContextType,
    RequireFields<
      MutationMoveChildrenArgs,
      | "documentIdentifiers"
      | "sourceParentIdentifier"
      | "targetParentIdentifier"
    >
  >;
  mutateDocument?: Resolver<
    ResolversTypes["PHDocument"],
    ParentType,
    ContextType,
    RequireFields<MutationMutateDocumentArgs, "actions" | "documentIdentifier">
  >;
  mutateDocumentAsync?: Resolver<
    ResolversTypes["String"],
    ParentType,
    ContextType,
    RequireFields<
      MutationMutateDocumentAsyncArgs,
      "actions" | "documentIdentifier"
    >
  >;
  pushSyncEnvelopes?: Resolver<
    ResolversTypes["Boolean"],
    ParentType,
    ContextType,
    RequireFields<MutationPushSyncEnvelopesArgs, "envelopes">
  >;
  removeChildren?: Resolver<
    ResolversTypes["PHDocument"],
    ParentType,
    ContextType,
    RequireFields<
      MutationRemoveChildrenArgs,
      "documentIdentifiers" | "parentIdentifier"
    >
  >;
  renameDocument?: Resolver<
    ResolversTypes["PHDocument"],
    ParentType,
    ContextType,
    RequireFields<MutationRenameDocumentArgs, "documentIdentifier" | "name">
  >;
  touchChannel?: Resolver<
    ResolversTypes["Boolean"],
    ParentType,
    ContextType,
    RequireFields<MutationTouchChannelArgs, "input">
  >;
}>;

export type OperationContextResolvers<
  ContextType = Context,
  ParentType extends ResolversParentTypes["OperationContext"] =
    ResolversParentTypes["OperationContext"],
> = ResolversObject<{
  branch?: Resolver<ResolversTypes["String"], ParentType, ContextType>;
  documentId?: Resolver<ResolversTypes["String"], ParentType, ContextType>;
  documentType?: Resolver<ResolversTypes["String"], ParentType, ContextType>;
  ordinal?: Resolver<ResolversTypes["Int"], ParentType, ContextType>;
  scope?: Resolver<ResolversTypes["String"], ParentType, ContextType>;
}>;

export type OperationWithContextResolvers<
  ContextType = Context,
  ParentType extends ResolversParentTypes["OperationWithContext"] =
    ResolversParentTypes["OperationWithContext"],
> = ResolversObject<{
  context?: Resolver<
    ResolversTypes["OperationContext"],
    ParentType,
    ContextType
  >;
  operation?: Resolver<
    ResolversTypes["ReactorOperation"],
    ParentType,
    ContextType
  >;
}>;

export type PhDocumentResolvers<
  ContextType = Context,
  ParentType extends ResolversParentTypes["PHDocument"] =
    ResolversParentTypes["PHDocument"],
> = ResolversObject<{
  createdAtUtcIso?: Resolver<
    ResolversTypes["DateTime"],
    ParentType,
    ContextType
  >;
  documentType?: Resolver<ResolversTypes["String"], ParentType, ContextType>;
  id?: Resolver<ResolversTypes["String"], ParentType, ContextType>;
  lastModifiedAtUtcIso?: Resolver<
    ResolversTypes["DateTime"],
    ParentType,
    ContextType
  >;
  name?: Resolver<ResolversTypes["String"], ParentType, ContextType>;
  operations?: Resolver<
    Maybe<ResolversTypes["ReactorOperationResultPage"]>,
    ParentType,
    ContextType,
    Partial<PhDocumentOperationsArgs>
  >;
  revisionsList?: Resolver<
    ReadonlyArray<ResolversTypes["Revision"]>,
    ParentType,
    ContextType
  >;
  slug?: Resolver<Maybe<ResolversTypes["String"]>, ParentType, ContextType>;
  state?: Resolver<ResolversTypes["JSONObject"], ParentType, ContextType>;
}>;

export type PhDocumentResultPageResolvers<
  ContextType = Context,
  ParentType extends ResolversParentTypes["PHDocumentResultPage"] =
    ResolversParentTypes["PHDocumentResultPage"],
> = ResolversObject<{
  cursor?: Resolver<Maybe<ResolversTypes["String"]>, ParentType, ContextType>;
  hasNextPage?: Resolver<ResolversTypes["Boolean"], ParentType, ContextType>;
  hasPreviousPage?: Resolver<
    ResolversTypes["Boolean"],
    ParentType,
    ContextType
  >;
  items?: Resolver<
    ReadonlyArray<ResolversTypes["PHDocument"]>,
    ParentType,
    ContextType
  >;
  totalCount?: Resolver<ResolversTypes["Int"], ParentType, ContextType>;
}>;

export type PollSyncEnvelopesResultResolvers<
  ContextType = Context,
  ParentType extends ResolversParentTypes["PollSyncEnvelopesResult"] =
    ResolversParentTypes["PollSyncEnvelopesResult"],
> = ResolversObject<{
  ackOrdinal?: Resolver<ResolversTypes["Int"], ParentType, ContextType>;
  deadLetters?: Resolver<
    ReadonlyArray<ResolversTypes["DeadLetterInfo"]>,
    ParentType,
    ContextType
  >;
  envelopes?: Resolver<
    ReadonlyArray<ResolversTypes["SyncEnvelope"]>,
    ParentType,
    ContextType
  >;
}>;

export type QueryResolvers<
  ContextType = Context,
  ParentType extends ResolversParentTypes["Query"] =
    ResolversParentTypes["Query"],
> = ResolversObject<{
  document?: Resolver<
    Maybe<ResolversTypes["DocumentWithChildren"]>,
    ParentType,
    ContextType,
    RequireFields<QueryDocumentArgs, "identifier">
  >;
  documentChildren?: Resolver<
    ResolversTypes["PHDocumentResultPage"],
    ParentType,
    ContextType,
    RequireFields<QueryDocumentChildrenArgs, "parentIdentifier">
  >;
  documentModels?: Resolver<
    ResolversTypes["DocumentModelResultPage"],
    ParentType,
    ContextType,
    Partial<QueryDocumentModelsArgs>
  >;
  documentOperations?: Resolver<
    ResolversTypes["ReactorOperationResultPage"],
    ParentType,
    ContextType,
    RequireFields<QueryDocumentOperationsArgs, "filter">
  >;
  documentParents?: Resolver<
    ResolversTypes["PHDocumentResultPage"],
    ParentType,
    ContextType,
    RequireFields<QueryDocumentParentsArgs, "childIdentifier">
  >;
  findDocuments?: Resolver<
    ResolversTypes["PHDocumentResultPage"],
    ParentType,
    ContextType,
    RequireFields<QueryFindDocumentsArgs, "search">
  >;
  jobStatus?: Resolver<
    Maybe<ResolversTypes["JobInfo"]>,
    ParentType,
    ContextType,
    RequireFields<QueryJobStatusArgs, "jobId">
  >;
  pollSyncEnvelopes?: Resolver<
    ResolversTypes["PollSyncEnvelopesResult"],
    ParentType,
    ContextType,
    RequireFields<
      QueryPollSyncEnvelopesArgs,
      "channelId" | "outboxAck" | "outboxLatest"
    >
  >;
}>;

export type ReactorOperationResolvers<
  ContextType = Context,
  ParentType extends ResolversParentTypes["ReactorOperation"] =
    ResolversParentTypes["ReactorOperation"],
> = ResolversObject<{
  action?: Resolver<ResolversTypes["Action"], ParentType, ContextType>;
  error?: Resolver<Maybe<ResolversTypes["String"]>, ParentType, ContextType>;
  hash?: Resolver<ResolversTypes["String"], ParentType, ContextType>;
  id?: Resolver<Maybe<ResolversTypes["String"]>, ParentType, ContextType>;
  index?: Resolver<ResolversTypes["Int"], ParentType, ContextType>;
  skip?: Resolver<ResolversTypes["Int"], ParentType, ContextType>;
  timestampUtcMs?: Resolver<ResolversTypes["String"], ParentType, ContextType>;
}>;

export type ReactorOperationResultPageResolvers<
  ContextType = Context,
  ParentType extends ResolversParentTypes["ReactorOperationResultPage"] =
    ResolversParentTypes["ReactorOperationResultPage"],
> = ResolversObject<{
  cursor?: Resolver<Maybe<ResolversTypes["String"]>, ParentType, ContextType>;
  hasNextPage?: Resolver<ResolversTypes["Boolean"], ParentType, ContextType>;
  hasPreviousPage?: Resolver<
    ResolversTypes["Boolean"],
    ParentType,
    ContextType
  >;
  items?: Resolver<
    ReadonlyArray<ResolversTypes["ReactorOperation"]>,
    ParentType,
    ContextType
  >;
  totalCount?: Resolver<ResolversTypes["Int"], ParentType, ContextType>;
}>;

export type ReactorSignerResolvers<
  ContextType = Context,
  ParentType extends ResolversParentTypes["ReactorSigner"] =
    ResolversParentTypes["ReactorSigner"],
> = ResolversObject<{
  app?: Resolver<
    Maybe<ResolversTypes["ReactorSignerApp"]>,
    ParentType,
    ContextType
  >;
  signatures?: Resolver<
    ReadonlyArray<ResolversTypes["String"]>,
    ParentType,
    ContextType
  >;
  user?: Resolver<
    Maybe<ResolversTypes["ReactorSignerUser"]>,
    ParentType,
    ContextType
  >;
}>;

export type ReactorSignerAppResolvers<
  ContextType = Context,
  ParentType extends ResolversParentTypes["ReactorSignerApp"] =
    ResolversParentTypes["ReactorSignerApp"],
> = ResolversObject<{
  key?: Resolver<ResolversTypes["String"], ParentType, ContextType>;
  name?: Resolver<ResolversTypes["String"], ParentType, ContextType>;
}>;

export type ReactorSignerUserResolvers<
  ContextType = Context,
  ParentType extends ResolversParentTypes["ReactorSignerUser"] =
    ResolversParentTypes["ReactorSignerUser"],
> = ResolversObject<{
  address?: Resolver<ResolversTypes["String"], ParentType, ContextType>;
  chainId?: Resolver<ResolversTypes["Int"], ParentType, ContextType>;
  networkId?: Resolver<ResolversTypes["String"], ParentType, ContextType>;
}>;

export type RemoteCursorResolvers<
  ContextType = Context,
  ParentType extends ResolversParentTypes["RemoteCursor"] =
    ResolversParentTypes["RemoteCursor"],
> = ResolversObject<{
  cursorOrdinal?: Resolver<ResolversTypes["Int"], ParentType, ContextType>;
  lastSyncedAtUtcMs?: Resolver<
    Maybe<ResolversTypes["String"]>,
    ParentType,
    ContextType
  >;
  remoteName?: Resolver<ResolversTypes["String"], ParentType, ContextType>;
}>;

export type RevisionResolvers<
  ContextType = Context,
  ParentType extends ResolversParentTypes["Revision"] =
    ResolversParentTypes["Revision"],
> = ResolversObject<{
  revision?: Resolver<ResolversTypes["Int"], ParentType, ContextType>;
  scope?: Resolver<ResolversTypes["String"], ParentType, ContextType>;
}>;

export type SubscriptionResolvers<
  ContextType = Context,
  ParentType extends ResolversParentTypes["Subscription"] =
    ResolversParentTypes["Subscription"],
> = ResolversObject<{
  documentChanges?: SubscriptionResolver<
    ResolversTypes["DocumentChangeEvent"],
    "documentChanges",
    ParentType,
    ContextType,
    RequireFields<SubscriptionDocumentChangesArgs, "search">
  >;
  jobChanges?: SubscriptionResolver<
    ResolversTypes["JobChangeEvent"],
    "jobChanges",
    ParentType,
    ContextType,
    RequireFields<SubscriptionJobChangesArgs, "jobId">
  >;
}>;

export type SyncEnvelopeResolvers<
  ContextType = Context,
  ParentType extends ResolversParentTypes["SyncEnvelope"] =
    ResolversParentTypes["SyncEnvelope"],
> = ResolversObject<{
  channelMeta?: Resolver<
    ResolversTypes["ChannelMeta"],
    ParentType,
    ContextType
  >;
  cursor?: Resolver<
    Maybe<ResolversTypes["RemoteCursor"]>,
    ParentType,
    ContextType
  >;
  dependsOn?: Resolver<
    Maybe<ReadonlyArray<ResolversTypes["String"]>>,
    ParentType,
    ContextType
  >;
  key?: Resolver<Maybe<ResolversTypes["String"]>, ParentType, ContextType>;
  operations?: Resolver<
    Maybe<ReadonlyArray<ResolversTypes["OperationWithContext"]>>,
    ParentType,
    ContextType
  >;
  type?: Resolver<ResolversTypes["SyncEnvelopeType"], ParentType, ContextType>;
}>;

export type Resolvers<ContextType = Context> = ResolversObject<{
  Action?: ActionResolvers<ContextType>;
  ActionContext?: ActionContextResolvers<ContextType>;
  Attachment?: AttachmentResolvers<ContextType>;
  ChannelMeta?: ChannelMetaResolvers<ContextType>;
  DateTime?: GraphQLScalarType;
  DeadLetterInfo?: DeadLetterInfoResolvers<ContextType>;
  DocumentChangeContext?: DocumentChangeContextResolvers<ContextType>;
  DocumentChangeEvent?: DocumentChangeEventResolvers<ContextType>;
  DocumentModelGlobalState?: DocumentModelGlobalStateResolvers<ContextType>;
  DocumentModelResultPage?: DocumentModelResultPageResolvers<ContextType>;
  DocumentWithChildren?: DocumentWithChildrenResolvers<ContextType>;
  JSONObject?: GraphQLScalarType;
  JobChangeEvent?: JobChangeEventResolvers<ContextType>;
  JobInfo?: JobInfoResolvers<ContextType>;
  MoveChildrenResult?: MoveChildrenResultResolvers<ContextType>;
  Mutation?: MutationResolvers<ContextType>;
  OperationContext?: OperationContextResolvers<ContextType>;
  OperationWithContext?: OperationWithContextResolvers<ContextType>;
  PHDocument?: PhDocumentResolvers<ContextType>;
  PHDocumentResultPage?: PhDocumentResultPageResolvers<ContextType>;
  PollSyncEnvelopesResult?: PollSyncEnvelopesResultResolvers<ContextType>;
  Query?: QueryResolvers<ContextType>;
  ReactorOperation?: ReactorOperationResolvers<ContextType>;
  ReactorOperationResultPage?: ReactorOperationResultPageResolvers<ContextType>;
  ReactorSigner?: ReactorSignerResolvers<ContextType>;
  ReactorSignerApp?: ReactorSignerAppResolvers<ContextType>;
  ReactorSignerUser?: ReactorSignerUserResolvers<ContextType>;
  RemoteCursor?: RemoteCursorResolvers<ContextType>;
  Revision?: RevisionResolvers<ContextType>;
  Subscription?: SubscriptionResolvers<ContextType>;
  SyncEnvelope?: SyncEnvelopeResolvers<ContextType>;
}>;

type Properties<T> = Required<{
  [K in keyof T]: z.ZodType<T[K]>;
}>;

type definedNonNullAny = {};

export const isDefinedNonNullAny = (v: any): v is definedNonNullAny =>
  v !== undefined && v !== null;

export const definedNonNullAnySchema = z
  .any()
  .refine((v) => isDefinedNonNullAny(v));

export const DocumentChangeTypeSchema = z.enum(DocumentChangeType);

export const PropagationModeSchema = z.enum(PropagationMode);

export const SyncEnvelopeTypeSchema = z.enum(SyncEnvelopeType);

export function ActionContextInputSchema(): z.ZodObject<
  Properties<ActionContextInput>
> {
  return z.object({
    signer: z.lazy(() => ReactorSignerInputSchema().nullish()),
  });
}

export function ActionInputSchema(): z.ZodObject<Properties<ActionInput>> {
  return z.object({
    attachments: z.array(z.lazy(() => AttachmentInputSchema())).nullish(),
    context: z.lazy(() => ActionContextInputSchema().nullish()),
    id: z.string(),
    input: z.custom<NonNullable<unknown>>((v) => v != null),
    scope: z.string(),
    timestampUtcMs: z.string(),
    type: z.string(),
  });
}

export function AttachmentInputSchema(): z.ZodObject<
  Properties<AttachmentInput>
> {
  return z.object({
    data: z.string(),
    extension: z.string().nullish(),
    fileName: z.string().nullish(),
    hash: z.string(),
    mimeType: z.string(),
  });
}

export function ChannelMetaInputSchema(): z.ZodObject<
  Properties<ChannelMetaInput>
> {
  return z.object({
    id: z.string(),
  });
}

export function DocumentOperationsFilterInputSchema(): z.ZodObject<
  Properties<DocumentOperationsFilterInput>
> {
  return z.object({
    actionTypes: z.array(z.string()).nullish(),
    branch: z.string().nullish(),
    scopes: z.array(z.string()).nullish(),
    sinceRevision: z.number().nullish(),
    timestampFrom: z.string().nullish(),
    timestampTo: z.string().nullish(),
  });
}

export function OperationContextInputSchema(): z.ZodObject<
  Properties<OperationContextInput>
> {
  return z.object({
    branch: z.string(),
    documentId: z.string(),
    documentType: z.string(),
    ordinal: z.number(),
    scope: z.string(),
  });
}

export function OperationInputSchema(): z.ZodObject<
  Properties<OperationInput>
> {
  return z.object({
    action: z.lazy(() => ActionInputSchema()),
    error: z.string().nullish(),
    hash: z.string(),
    id: z.string().nullish(),
    index: z.number(),
    skip: z.number(),
    timestampUtcMs: z.string(),
  });
}

export function OperationWithContextInputSchema(): z.ZodObject<
  Properties<OperationWithContextInput>
> {
  return z.object({
    context: z.lazy(() => OperationContextInputSchema()),
    operation: z.lazy(() => OperationInputSchema()),
  });
}

export function OperationsFilterInputSchema(): z.ZodObject<
  Properties<OperationsFilterInput>
> {
  return z.object({
    actionTypes: z.array(z.string()).nullish(),
    branch: z.string().nullish(),
    documentId: z.string(),
    scopes: z.array(z.string()).nullish(),
    sinceRevision: z.number().nullish(),
    timestampFrom: z.string().nullish(),
    timestampTo: z.string().nullish(),
  });
}

export function PagingInputSchema(): z.ZodObject<Properties<PagingInput>> {
  return z.object({
    cursor: z.string().nullish(),
    limit: z.number().nullish(),
    offset: z.number().nullish(),
  });
}

export function ReactorSignerAppInputSchema(): z.ZodObject<
  Properties<ReactorSignerAppInput>
> {
  return z.object({
    key: z.string(),
    name: z.string(),
  });
}

export function ReactorSignerInputSchema(): z.ZodObject<
  Properties<ReactorSignerInput>
> {
  return z.object({
    app: z.lazy(() => ReactorSignerAppInputSchema().nullish()),
    signatures: z.array(z.string()),
    user: z.lazy(() => ReactorSignerUserInputSchema().nullish()),
  });
}

export function ReactorSignerUserInputSchema(): z.ZodObject<
  Properties<ReactorSignerUserInput>
> {
  return z.object({
    address: z.string(),
    chainId: z.number(),
    networkId: z.string(),
  });
}

export function RemoteCursorInputSchema(): z.ZodObject<
  Properties<RemoteCursorInput>
> {
  return z.object({
    cursorOrdinal: z.number(),
    lastSyncedAtUtcMs: z.string().nullish(),
    remoteName: z.string(),
  });
}

export function RemoteFilterInputSchema(): z.ZodObject<
  Properties<RemoteFilterInput>
> {
  return z.object({
    branch: z.string(),
    documentId: z.array(z.string()),
    scope: z.array(z.string()),
  });
}

export function SearchFilterInputSchema(): z.ZodObject<
  Properties<SearchFilterInput>
> {
  return z.object({
    identifiers: z.array(z.string()).nullish(),
    parentId: z.string().nullish(),
    type: z.string().nullish(),
  });
}

export function SyncEnvelopeInputSchema(): z.ZodObject<
  Properties<SyncEnvelopeInput>
> {
  return z.object({
    channelMeta: z.lazy(() => ChannelMetaInputSchema()),
    cursor: z.lazy(() => RemoteCursorInputSchema().nullish()),
    dependsOn: z.array(z.string()).nullish(),
    key: z.string().nullish(),
    operations: z
      .array(z.lazy(() => OperationWithContextInputSchema()))
      .nullish(),
    type: SyncEnvelopeTypeSchema,
  });
}

export function TouchChannelInputSchema(): z.ZodObject<
  Properties<TouchChannelInput>
> {
  return z.object({
    collectionId: z.string(),
    filter: z.lazy(() => RemoteFilterInputSchema()),
    id: z.string(),
    name: z.string(),
    sinceTimestampUtcMs: z.string(),
  });
}

export function ViewFilterInputSchema(): z.ZodObject<
  Properties<ViewFilterInput>
> {
  return z.object({
    branch: z.string().nullish(),
    scopes: z.array(z.string()).nullish(),
  });
}

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
export const GetDocumentChildrenDocument = gql`
  query GetDocumentChildren(
    $parentIdentifier: String!
    $view: ViewFilterInput
    $paging: PagingInput
  ) {
    documentChildren(
      parentIdentifier: $parentIdentifier
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
export const GetDocumentParentsDocument = gql`
  query GetDocumentParents(
    $childIdentifier: String!
    $view: ViewFilterInput
    $paging: PagingInput
  ) {
    documentParents(
      childIdentifier: $childIdentifier
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
    $search: SearchFilterInput!
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
export const AddChildrenDocument = gql`
  mutation AddChildren(
    $parentIdentifier: String!
    $documentIdentifiers: [String!]!
    $branch: String
  ) {
    addChildren(
      parentIdentifier: $parentIdentifier
      documentIdentifiers: $documentIdentifiers
      branch: $branch
    ) {
      ...PHDocumentFields
    }
  }
  ${PhDocumentFieldsFragmentDoc}
`;
export const RemoveChildrenDocument = gql`
  mutation RemoveChildren(
    $parentIdentifier: String!
    $documentIdentifiers: [String!]!
    $branch: String
  ) {
    removeChildren(
      parentIdentifier: $parentIdentifier
      documentIdentifiers: $documentIdentifiers
      branch: $branch
    ) {
      ...PHDocumentFields
    }
  }
  ${PhDocumentFieldsFragmentDoc}
`;
export const MoveChildrenDocument = gql`
  mutation MoveChildren(
    $sourceParentIdentifier: String!
    $targetParentIdentifier: String!
    $documentIdentifiers: [String!]!
    $branch: String
  ) {
    moveChildren(
      sourceParentIdentifier: $sourceParentIdentifier
      targetParentIdentifier: $targetParentIdentifier
      documentIdentifiers: $documentIdentifiers
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
    $search: SearchFilterInput!
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
    }
  }
`;
export const TouchChannelDocument = gql`
  mutation TouchChannel($input: TouchChannelInput!) {
    touchChannel(input: $input)
  }
`;
export const PushSyncEnvelopesDocument = gql`
  mutation PushSyncEnvelopes($envelopes: [SyncEnvelopeInput!]!) {
    pushSyncEnvelopes(envelopes: $envelopes)
  }
`;
export type Requester<C = {}> = <R, V>(
  doc: DocumentNode,
  vars?: V,
  options?: C,
) => Promise<R> | AsyncIterable<R>;
export function getSdk<C>(requester: Requester<C>) {
  return {
    GetDocumentModels(
      variables?: GetDocumentModelsQueryVariables,
      options?: C,
    ): Promise<GetDocumentModelsQuery> {
      return requester<GetDocumentModelsQuery, GetDocumentModelsQueryVariables>(
        GetDocumentModelsDocument,
        variables,
        options,
      ) as Promise<GetDocumentModelsQuery>;
    },
    GetDocument(
      variables: GetDocumentQueryVariables,
      options?: C,
    ): Promise<GetDocumentQuery> {
      return requester<GetDocumentQuery, GetDocumentQueryVariables>(
        GetDocumentDocument,
        variables,
        options,
      ) as Promise<GetDocumentQuery>;
    },
    GetDocumentChildren(
      variables: GetDocumentChildrenQueryVariables,
      options?: C,
    ): Promise<GetDocumentChildrenQuery> {
      return requester<
        GetDocumentChildrenQuery,
        GetDocumentChildrenQueryVariables
      >(
        GetDocumentChildrenDocument,
        variables,
        options,
      ) as Promise<GetDocumentChildrenQuery>;
    },
    GetDocumentParents(
      variables: GetDocumentParentsQueryVariables,
      options?: C,
    ): Promise<GetDocumentParentsQuery> {
      return requester<
        GetDocumentParentsQuery,
        GetDocumentParentsQueryVariables
      >(
        GetDocumentParentsDocument,
        variables,
        options,
      ) as Promise<GetDocumentParentsQuery>;
    },
    FindDocuments(
      variables: FindDocumentsQueryVariables,
      options?: C,
    ): Promise<FindDocumentsQuery> {
      return requester<FindDocumentsQuery, FindDocumentsQueryVariables>(
        FindDocumentsDocument,
        variables,
        options,
      ) as Promise<FindDocumentsQuery>;
    },
    GetJobStatus(
      variables: GetJobStatusQueryVariables,
      options?: C,
    ): Promise<GetJobStatusQuery> {
      return requester<GetJobStatusQuery, GetJobStatusQueryVariables>(
        GetJobStatusDocument,
        variables,
        options,
      ) as Promise<GetJobStatusQuery>;
    },
    CreateDocument(
      variables: CreateDocumentMutationVariables,
      options?: C,
    ): Promise<CreateDocumentMutation> {
      return requester<CreateDocumentMutation, CreateDocumentMutationVariables>(
        CreateDocumentDocument,
        variables,
        options,
      ) as Promise<CreateDocumentMutation>;
    },
    CreateEmptyDocument(
      variables: CreateEmptyDocumentMutationVariables,
      options?: C,
    ): Promise<CreateEmptyDocumentMutation> {
      return requester<
        CreateEmptyDocumentMutation,
        CreateEmptyDocumentMutationVariables
      >(
        CreateEmptyDocumentDocument,
        variables,
        options,
      ) as Promise<CreateEmptyDocumentMutation>;
    },
    MutateDocument(
      variables: MutateDocumentMutationVariables,
      options?: C,
    ): Promise<MutateDocumentMutation> {
      return requester<MutateDocumentMutation, MutateDocumentMutationVariables>(
        MutateDocumentDocument,
        variables,
        options,
      ) as Promise<MutateDocumentMutation>;
    },
    MutateDocumentAsync(
      variables: MutateDocumentAsyncMutationVariables,
      options?: C,
    ): Promise<MutateDocumentAsyncMutation> {
      return requester<
        MutateDocumentAsyncMutation,
        MutateDocumentAsyncMutationVariables
      >(
        MutateDocumentAsyncDocument,
        variables,
        options,
      ) as Promise<MutateDocumentAsyncMutation>;
    },
    RenameDocument(
      variables: RenameDocumentMutationVariables,
      options?: C,
    ): Promise<RenameDocumentMutation> {
      return requester<RenameDocumentMutation, RenameDocumentMutationVariables>(
        RenameDocumentDocument,
        variables,
        options,
      ) as Promise<RenameDocumentMutation>;
    },
    AddChildren(
      variables: AddChildrenMutationVariables,
      options?: C,
    ): Promise<AddChildrenMutation> {
      return requester<AddChildrenMutation, AddChildrenMutationVariables>(
        AddChildrenDocument,
        variables,
        options,
      ) as Promise<AddChildrenMutation>;
    },
    RemoveChildren(
      variables: RemoveChildrenMutationVariables,
      options?: C,
    ): Promise<RemoveChildrenMutation> {
      return requester<RemoveChildrenMutation, RemoveChildrenMutationVariables>(
        RemoveChildrenDocument,
        variables,
        options,
      ) as Promise<RemoveChildrenMutation>;
    },
    MoveChildren(
      variables: MoveChildrenMutationVariables,
      options?: C,
    ): Promise<MoveChildrenMutation> {
      return requester<MoveChildrenMutation, MoveChildrenMutationVariables>(
        MoveChildrenDocument,
        variables,
        options,
      ) as Promise<MoveChildrenMutation>;
    },
    DeleteDocument(
      variables: DeleteDocumentMutationVariables,
      options?: C,
    ): Promise<DeleteDocumentMutation> {
      return requester<DeleteDocumentMutation, DeleteDocumentMutationVariables>(
        DeleteDocumentDocument,
        variables,
        options,
      ) as Promise<DeleteDocumentMutation>;
    },
    DeleteDocuments(
      variables: DeleteDocumentsMutationVariables,
      options?: C,
    ): Promise<DeleteDocumentsMutation> {
      return requester<
        DeleteDocumentsMutation,
        DeleteDocumentsMutationVariables
      >(
        DeleteDocumentsDocument,
        variables,
        options,
      ) as Promise<DeleteDocumentsMutation>;
    },
    DocumentChanges(
      variables: DocumentChangesSubscriptionVariables,
      options?: C,
    ): AsyncIterable<DocumentChangesSubscription> {
      return requester<
        DocumentChangesSubscription,
        DocumentChangesSubscriptionVariables
      >(
        DocumentChangesDocument,
        variables,
        options,
      ) as AsyncIterable<DocumentChangesSubscription>;
    },
    JobChanges(
      variables: JobChangesSubscriptionVariables,
      options?: C,
    ): AsyncIterable<JobChangesSubscription> {
      return requester<JobChangesSubscription, JobChangesSubscriptionVariables>(
        JobChangesDocument,
        variables,
        options,
      ) as AsyncIterable<JobChangesSubscription>;
    },
    PollSyncEnvelopes(
      variables: PollSyncEnvelopesQueryVariables,
      options?: C,
    ): Promise<PollSyncEnvelopesQuery> {
      return requester<PollSyncEnvelopesQuery, PollSyncEnvelopesQueryVariables>(
        PollSyncEnvelopesDocument,
        variables,
        options,
      ) as Promise<PollSyncEnvelopesQuery>;
    },
    TouchChannel(
      variables: TouchChannelMutationVariables,
      options?: C,
    ): Promise<TouchChannelMutation> {
      return requester<TouchChannelMutation, TouchChannelMutationVariables>(
        TouchChannelDocument,
        variables,
        options,
      ) as Promise<TouchChannelMutation>;
    },
    PushSyncEnvelopes(
      variables: PushSyncEnvelopesMutationVariables,
      options?: C,
    ): Promise<PushSyncEnvelopesMutation> {
      return requester<
        PushSyncEnvelopesMutation,
        PushSyncEnvelopesMutationVariables
      >(
        PushSyncEnvelopesDocument,
        variables,
        options,
      ) as Promise<PushSyncEnvelopesMutation>;
    },
  };
}
export type Sdk = ReturnType<typeof getSdk>;
