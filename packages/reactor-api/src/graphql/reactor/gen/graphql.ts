import {
  GraphQLResolveInfo,
  GraphQLScalarType,
  GraphQLScalarTypeConfig,
} from "graphql";
import { Context } from "../../types.js";
import { z } from "zod";
import { DocumentNode } from "graphql";
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
  JSONObject: { input: any; output: any };
};

export type Action = {
  readonly attachments?: Maybe<ReadonlyArray<AttachmentInput>>;
  readonly context?: Maybe<ActionContext>;
  readonly id: Scalars["String"]["output"];
  readonly input?: Maybe<Scalars["JSONObject"]["output"]>;
  readonly scope: Scalars["String"]["output"];
  readonly timestampUtcMs: Scalars["String"]["output"];
  readonly type: Scalars["String"]["output"];
};

export type ActionContext = {
  readonly signer?: Maybe<Signer>;
};

export type AttachmentInput = {
  readonly data: Scalars["String"]["output"];
  readonly extension?: Maybe<Scalars["String"]["output"]>;
  readonly fileName?: Maybe<Scalars["String"]["output"]>;
  readonly hash: Scalars["String"]["output"];
  readonly mimeType: Scalars["String"]["output"];
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

export type DocumentModelResultPage = {
  readonly cursor?: Maybe<Scalars["String"]["output"]>;
  readonly hasNextPage: Scalars["Boolean"]["output"];
  readonly hasPreviousPage: Scalars["Boolean"]["output"];
  readonly items: ReadonlyArray<DocumentModelState>;
  readonly totalCount: Scalars["Int"]["output"];
};

export type DocumentModelState = {
  readonly id: Scalars["String"]["output"];
  readonly name: Scalars["String"]["output"];
  readonly namespace?: Maybe<Scalars["String"]["output"]>;
  readonly specification?: Maybe<Scalars["JSONObject"]["output"]>;
  readonly version?: Maybe<Scalars["String"]["output"]>;
};

export type DocumentWithChildren = {
  readonly childIds: ReadonlyArray<Scalars["String"]["output"]>;
  readonly document: PhDocument;
};

export type JobChangeEvent = {
  readonly error?: Maybe<Scalars["String"]["output"]>;
  readonly jobId: Scalars["String"]["output"];
  readonly result?: Maybe<Scalars["JSONObject"]["output"]>;
  readonly status: Scalars["String"]["output"];
};

export type JobInfo = {
  readonly completedAt?: Maybe<Scalars["DateTime"]["output"]>;
  readonly createdAt: Scalars["DateTime"]["output"];
  readonly error?: Maybe<Scalars["String"]["output"]>;
  readonly id: Scalars["String"]["output"];
  readonly result?: Maybe<Scalars["JSONObject"]["output"]>;
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
  readonly removeChildren: PhDocument;
  readonly renameDocument: PhDocument;
};

export type MutationAddChildrenArgs = {
  documentIdentifiers: ReadonlyArray<Scalars["String"]["input"]>;
  parentIdentifier: Scalars["String"]["input"];
  view?: InputMaybe<ViewFilterInput>;
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
  documentIdentifiers: ReadonlyArray<Scalars["String"]["input"]>;
  sourceParentIdentifier: Scalars["String"]["input"];
  targetParentIdentifier: Scalars["String"]["input"];
  view?: InputMaybe<ViewFilterInput>;
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

export type MutationRemoveChildrenArgs = {
  documentIdentifiers: ReadonlyArray<Scalars["String"]["input"]>;
  parentIdentifier: Scalars["String"]["input"];
  view?: InputMaybe<ViewFilterInput>;
};

export type MutationRenameDocumentArgs = {
  documentIdentifier: Scalars["String"]["input"];
  name: Scalars["String"]["input"];
  view?: InputMaybe<ViewFilterInput>;
};

export type PhDocument = {
  readonly created: Scalars["DateTime"]["output"];
  readonly documentType: Scalars["String"]["output"];
  readonly id: Scalars["String"]["output"];
  readonly lastModified: Scalars["DateTime"]["output"];
  readonly name: Scalars["String"]["output"];
  readonly parentId?: Maybe<Scalars["String"]["output"]>;
  readonly revision: Scalars["Int"]["output"];
  readonly slug?: Maybe<Scalars["String"]["output"]>;
  readonly state: Scalars["JSONObject"]["output"];
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

export enum PropagationMode {
  Cascade = "CASCADE",
  Orphan = "ORPHAN",
}

export type Query = {
  readonly document?: Maybe<DocumentWithChildren>;
  readonly documentChildren: PhDocumentResultPage;
  readonly documentModels: DocumentModelResultPage;
  readonly documentParents: PhDocumentResultPage;
  readonly findDocuments: PhDocumentResultPage;
  readonly jobStatus?: Maybe<JobInfo>;
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

export type SearchFilterInput = {
  readonly identifiers?: InputMaybe<ReadonlyArray<Scalars["String"]["input"]>>;
  readonly parentId?: InputMaybe<Scalars["String"]["input"]>;
  readonly type?: InputMaybe<Scalars["String"]["input"]>;
};

export type Signer = {
  readonly app?: Maybe<SignerApp>;
  readonly signatures: ReadonlyArray<Scalars["String"]["output"]>;
  readonly user?: Maybe<SignerUser>;
};

export type SignerApp = {
  readonly key: Scalars["String"]["output"];
  readonly name: Scalars["String"]["output"];
};

export type SignerUser = {
  readonly address: Scalars["String"]["output"];
  readonly chainId: Scalars["Int"]["output"];
  readonly networkId: Scalars["String"]["output"];
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

export type ViewFilterInput = {
  readonly branch?: InputMaybe<Scalars["String"]["input"]>;
  readonly scopes?: InputMaybe<ReadonlyArray<Scalars["String"]["input"]>>;
};

export type PhDocumentFieldsFragment = {
  readonly id: string;
  readonly slug?: string | null | undefined;
  readonly name: string;
  readonly documentType: string;
  readonly state: any;
  readonly revision: number;
  readonly created: string | Date;
  readonly lastModified: string | Date;
  readonly parentId?: string | null | undefined;
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
      readonly specification?: any | null | undefined;
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
          readonly state: any;
          readonly revision: number;
          readonly created: string | Date;
          readonly lastModified: string | Date;
          readonly parentId?: string | null | undefined;
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
      readonly state: any;
      readonly revision: number;
      readonly created: string | Date;
      readonly lastModified: string | Date;
      readonly parentId?: string | null | undefined;
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
      readonly state: any;
      readonly revision: number;
      readonly created: string | Date;
      readonly lastModified: string | Date;
      readonly parentId?: string | null | undefined;
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
      readonly state: any;
      readonly revision: number;
      readonly created: string | Date;
      readonly lastModified: string | Date;
      readonly parentId?: string | null | undefined;
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
        readonly result?: any | null | undefined;
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
    readonly state: any;
    readonly revision: number;
    readonly created: string | Date;
    readonly lastModified: string | Date;
    readonly parentId?: string | null | undefined;
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
    readonly state: any;
    readonly revision: number;
    readonly created: string | Date;
    readonly lastModified: string | Date;
    readonly parentId?: string | null | undefined;
  };
};

export type MutateDocumentMutationVariables = Exact<{
  documentIdentifier: Scalars["String"]["input"];
  actions:
    | ReadonlyArray<Scalars["JSONObject"]["input"]>
    | Scalars["JSONObject"]["input"];
  view?: InputMaybe<ViewFilterInput>;
}>;

export type MutateDocumentMutation = {
  readonly mutateDocument: {
    readonly id: string;
    readonly slug?: string | null | undefined;
    readonly name: string;
    readonly documentType: string;
    readonly state: any;
    readonly revision: number;
    readonly created: string | Date;
    readonly lastModified: string | Date;
    readonly parentId?: string | null | undefined;
  };
};

export type MutateDocumentAsyncMutationVariables = Exact<{
  documentIdentifier: Scalars["String"]["input"];
  actions:
    | ReadonlyArray<Scalars["JSONObject"]["input"]>
    | Scalars["JSONObject"]["input"];
  view?: InputMaybe<ViewFilterInput>;
}>;

export type MutateDocumentAsyncMutation = {
  readonly mutateDocumentAsync: string;
};

export type RenameDocumentMutationVariables = Exact<{
  documentIdentifier: Scalars["String"]["input"];
  name: Scalars["String"]["input"];
  view?: InputMaybe<ViewFilterInput>;
}>;

export type RenameDocumentMutation = {
  readonly renameDocument: {
    readonly id: string;
    readonly slug?: string | null | undefined;
    readonly name: string;
    readonly documentType: string;
    readonly state: any;
    readonly revision: number;
    readonly created: string | Date;
    readonly lastModified: string | Date;
    readonly parentId?: string | null | undefined;
  };
};

export type AddChildrenMutationVariables = Exact<{
  parentIdentifier: Scalars["String"]["input"];
  documentIdentifiers:
    | ReadonlyArray<Scalars["String"]["input"]>
    | Scalars["String"]["input"];
  view?: InputMaybe<ViewFilterInput>;
}>;

export type AddChildrenMutation = {
  readonly addChildren: {
    readonly id: string;
    readonly slug?: string | null | undefined;
    readonly name: string;
    readonly documentType: string;
    readonly state: any;
    readonly revision: number;
    readonly created: string | Date;
    readonly lastModified: string | Date;
    readonly parentId?: string | null | undefined;
  };
};

export type RemoveChildrenMutationVariables = Exact<{
  parentIdentifier: Scalars["String"]["input"];
  documentIdentifiers:
    | ReadonlyArray<Scalars["String"]["input"]>
    | Scalars["String"]["input"];
  view?: InputMaybe<ViewFilterInput>;
}>;

export type RemoveChildrenMutation = {
  readonly removeChildren: {
    readonly id: string;
    readonly slug?: string | null | undefined;
    readonly name: string;
    readonly documentType: string;
    readonly state: any;
    readonly revision: number;
    readonly created: string | Date;
    readonly lastModified: string | Date;
    readonly parentId?: string | null | undefined;
  };
};

export type MoveChildrenMutationVariables = Exact<{
  sourceParentIdentifier: Scalars["String"]["input"];
  targetParentIdentifier: Scalars["String"]["input"];
  documentIdentifiers:
    | ReadonlyArray<Scalars["String"]["input"]>
    | Scalars["String"]["input"];
  view?: InputMaybe<ViewFilterInput>;
}>;

export type MoveChildrenMutation = {
  readonly moveChildren: {
    readonly source: {
      readonly id: string;
      readonly slug?: string | null | undefined;
      readonly name: string;
      readonly documentType: string;
      readonly state: any;
      readonly revision: number;
      readonly created: string | Date;
      readonly lastModified: string | Date;
      readonly parentId?: string | null | undefined;
    };
    readonly target: {
      readonly id: string;
      readonly slug?: string | null | undefined;
      readonly name: string;
      readonly documentType: string;
      readonly state: any;
      readonly revision: number;
      readonly created: string | Date;
      readonly lastModified: string | Date;
      readonly parentId?: string | null | undefined;
    };
  };
};

export type DeleteDocumentMutationVariables = Exact<{
  identifier: Scalars["String"]["input"];
  propagate?: InputMaybe<PropagationMode>;
}>;

export type DeleteDocumentMutation = { readonly deleteDocument: boolean };

export type DeleteDocumentsMutationVariables = Exact<{
  identifiers:
    | ReadonlyArray<Scalars["String"]["input"]>
    | Scalars["String"]["input"];
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
      readonly state: any;
      readonly revision: number;
      readonly created: string | Date;
      readonly lastModified: string | Date;
      readonly parentId?: string | null | undefined;
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
    readonly result?: any | null | undefined;
    readonly error?: string | null | undefined;
  };
};

export type WithIndex<TObject> = TObject & Record<string, any>;
export type ResolversObject<TObject> = WithIndex<TObject>;

export type ResolverTypeWrapper<T> = Promise<T> | T;

export type ResolverWithResolve<TResult, TParent, TContext, TArgs> = {
  resolve: ResolverFn<TResult, TParent, TContext, TArgs>;
};
export type Resolver<TResult, TParent = {}, TContext = {}, TArgs = {}> =
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
  TParent = {},
  TContext = {},
  TArgs = {},
> =
  | ((
      ...args: any[]
    ) => SubscriptionObject<TResult, TKey, TParent, TContext, TArgs>)
  | SubscriptionObject<TResult, TKey, TParent, TContext, TArgs>;

export type TypeResolveFn<TTypes, TParent = {}, TContext = {}> = (
  parent: TParent,
  context: TContext,
  info: GraphQLResolveInfo,
) => Maybe<TTypes> | Promise<Maybe<TTypes>>;

export type IsTypeOfResolverFn<T = {}, TContext = {}> = (
  obj: T,
  context: TContext,
  info: GraphQLResolveInfo,
) => boolean | Promise<boolean>;

export type NextResolverFn<T> = () => Promise<T>;

export type DirectiveResolverFn<
  TResult = {},
  TParent = {},
  TContext = {},
  TArgs = {},
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
  AttachmentInput: ResolverTypeWrapper<AttachmentInput>;
  Boolean: ResolverTypeWrapper<Scalars["Boolean"]["output"]>;
  DateTime: ResolverTypeWrapper<Scalars["DateTime"]["output"]>;
  DocumentChangeContext: ResolverTypeWrapper<DocumentChangeContext>;
  DocumentChangeEvent: ResolverTypeWrapper<DocumentChangeEvent>;
  DocumentChangeType: DocumentChangeType;
  DocumentModelResultPage: ResolverTypeWrapper<DocumentModelResultPage>;
  DocumentModelState: ResolverTypeWrapper<DocumentModelState>;
  DocumentWithChildren: ResolverTypeWrapper<DocumentWithChildren>;
  Int: ResolverTypeWrapper<Scalars["Int"]["output"]>;
  JSONObject: ResolverTypeWrapper<Scalars["JSONObject"]["output"]>;
  JobChangeEvent: ResolverTypeWrapper<JobChangeEvent>;
  JobInfo: ResolverTypeWrapper<JobInfo>;
  MoveChildrenResult: ResolverTypeWrapper<MoveChildrenResult>;
  Mutation: ResolverTypeWrapper<{}>;
  PHDocument: ResolverTypeWrapper<PhDocument>;
  PHDocumentResultPage: ResolverTypeWrapper<PhDocumentResultPage>;
  PagingInput: PagingInput;
  PropagationMode: PropagationMode;
  Query: ResolverTypeWrapper<{}>;
  SearchFilterInput: SearchFilterInput;
  Signer: ResolverTypeWrapper<Signer>;
  SignerApp: ResolverTypeWrapper<SignerApp>;
  SignerUser: ResolverTypeWrapper<SignerUser>;
  String: ResolverTypeWrapper<Scalars["String"]["output"]>;
  Subscription: ResolverTypeWrapper<{}>;
  ViewFilterInput: ViewFilterInput;
}>;

/** Mapping between all available schema types and the resolvers parents */
export type ResolversParentTypes = ResolversObject<{
  Action: Action;
  ActionContext: ActionContext;
  AttachmentInput: AttachmentInput;
  Boolean: Scalars["Boolean"]["output"];
  DateTime: Scalars["DateTime"]["output"];
  DocumentChangeContext: DocumentChangeContext;
  DocumentChangeEvent: DocumentChangeEvent;
  DocumentModelResultPage: DocumentModelResultPage;
  DocumentModelState: DocumentModelState;
  DocumentWithChildren: DocumentWithChildren;
  Int: Scalars["Int"]["output"];
  JSONObject: Scalars["JSONObject"]["output"];
  JobChangeEvent: JobChangeEvent;
  JobInfo: JobInfo;
  MoveChildrenResult: MoveChildrenResult;
  Mutation: {};
  PHDocument: PhDocument;
  PHDocumentResultPage: PhDocumentResultPage;
  PagingInput: PagingInput;
  Query: {};
  SearchFilterInput: SearchFilterInput;
  Signer: Signer;
  SignerApp: SignerApp;
  SignerUser: SignerUser;
  String: Scalars["String"]["output"];
  Subscription: {};
  ViewFilterInput: ViewFilterInput;
}>;

export type ActionResolvers<
  ContextType = Context,
  ParentType extends
    ResolversParentTypes["Action"] = ResolversParentTypes["Action"],
> = ResolversObject<{
  attachments?: Resolver<
    Maybe<ReadonlyArray<ResolversTypes["AttachmentInput"]>>,
    ParentType,
    ContextType
  >;
  context?: Resolver<
    Maybe<ResolversTypes["ActionContext"]>,
    ParentType,
    ContextType
  >;
  id?: Resolver<ResolversTypes["String"], ParentType, ContextType>;
  input?: Resolver<
    Maybe<ResolversTypes["JSONObject"]>,
    ParentType,
    ContextType
  >;
  scope?: Resolver<ResolversTypes["String"], ParentType, ContextType>;
  timestampUtcMs?: Resolver<ResolversTypes["String"], ParentType, ContextType>;
  type?: Resolver<ResolversTypes["String"], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type ActionContextResolvers<
  ContextType = Context,
  ParentType extends
    ResolversParentTypes["ActionContext"] = ResolversParentTypes["ActionContext"],
> = ResolversObject<{
  signer?: Resolver<Maybe<ResolversTypes["Signer"]>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type AttachmentInputResolvers<
  ContextType = Context,
  ParentType extends
    ResolversParentTypes["AttachmentInput"] = ResolversParentTypes["AttachmentInput"],
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
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export interface DateTimeScalarConfig
  extends GraphQLScalarTypeConfig<ResolversTypes["DateTime"], any> {
  name: "DateTime";
}

export type DocumentChangeContextResolvers<
  ContextType = Context,
  ParentType extends
    ResolversParentTypes["DocumentChangeContext"] = ResolversParentTypes["DocumentChangeContext"],
> = ResolversObject<{
  childId?: Resolver<Maybe<ResolversTypes["String"]>, ParentType, ContextType>;
  parentId?: Resolver<Maybe<ResolversTypes["String"]>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type DocumentChangeEventResolvers<
  ContextType = Context,
  ParentType extends
    ResolversParentTypes["DocumentChangeEvent"] = ResolversParentTypes["DocumentChangeEvent"],
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
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type DocumentModelResultPageResolvers<
  ContextType = Context,
  ParentType extends
    ResolversParentTypes["DocumentModelResultPage"] = ResolversParentTypes["DocumentModelResultPage"],
> = ResolversObject<{
  cursor?: Resolver<Maybe<ResolversTypes["String"]>, ParentType, ContextType>;
  hasNextPage?: Resolver<ResolversTypes["Boolean"], ParentType, ContextType>;
  hasPreviousPage?: Resolver<
    ResolversTypes["Boolean"],
    ParentType,
    ContextType
  >;
  items?: Resolver<
    ReadonlyArray<ResolversTypes["DocumentModelState"]>,
    ParentType,
    ContextType
  >;
  totalCount?: Resolver<ResolversTypes["Int"], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type DocumentModelStateResolvers<
  ContextType = Context,
  ParentType extends
    ResolversParentTypes["DocumentModelState"] = ResolversParentTypes["DocumentModelState"],
> = ResolversObject<{
  id?: Resolver<ResolversTypes["String"], ParentType, ContextType>;
  name?: Resolver<ResolversTypes["String"], ParentType, ContextType>;
  namespace?: Resolver<
    Maybe<ResolversTypes["String"]>,
    ParentType,
    ContextType
  >;
  specification?: Resolver<
    Maybe<ResolversTypes["JSONObject"]>,
    ParentType,
    ContextType
  >;
  version?: Resolver<Maybe<ResolversTypes["String"]>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type DocumentWithChildrenResolvers<
  ContextType = Context,
  ParentType extends
    ResolversParentTypes["DocumentWithChildren"] = ResolversParentTypes["DocumentWithChildren"],
> = ResolversObject<{
  childIds?: Resolver<
    ReadonlyArray<ResolversTypes["String"]>,
    ParentType,
    ContextType
  >;
  document?: Resolver<ResolversTypes["PHDocument"], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export interface JsonObjectScalarConfig
  extends GraphQLScalarTypeConfig<ResolversTypes["JSONObject"], any> {
  name: "JSONObject";
}

export type JobChangeEventResolvers<
  ContextType = Context,
  ParentType extends
    ResolversParentTypes["JobChangeEvent"] = ResolversParentTypes["JobChangeEvent"],
> = ResolversObject<{
  error?: Resolver<Maybe<ResolversTypes["String"]>, ParentType, ContextType>;
  jobId?: Resolver<ResolversTypes["String"], ParentType, ContextType>;
  result?: Resolver<
    Maybe<ResolversTypes["JSONObject"]>,
    ParentType,
    ContextType
  >;
  status?: Resolver<ResolversTypes["String"], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type JobInfoResolvers<
  ContextType = Context,
  ParentType extends
    ResolversParentTypes["JobInfo"] = ResolversParentTypes["JobInfo"],
> = ResolversObject<{
  completedAt?: Resolver<
    Maybe<ResolversTypes["DateTime"]>,
    ParentType,
    ContextType
  >;
  createdAt?: Resolver<ResolversTypes["DateTime"], ParentType, ContextType>;
  error?: Resolver<Maybe<ResolversTypes["String"]>, ParentType, ContextType>;
  id?: Resolver<ResolversTypes["String"], ParentType, ContextType>;
  result?: Resolver<
    Maybe<ResolversTypes["JSONObject"]>,
    ParentType,
    ContextType
  >;
  status?: Resolver<ResolversTypes["String"], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type MoveChildrenResultResolvers<
  ContextType = Context,
  ParentType extends
    ResolversParentTypes["MoveChildrenResult"] = ResolversParentTypes["MoveChildrenResult"],
> = ResolversObject<{
  source?: Resolver<ResolversTypes["PHDocument"], ParentType, ContextType>;
  target?: Resolver<ResolversTypes["PHDocument"], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type MutationResolvers<
  ContextType = Context,
  ParentType extends
    ResolversParentTypes["Mutation"] = ResolversParentTypes["Mutation"],
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
}>;

export type PhDocumentResolvers<
  ContextType = Context,
  ParentType extends
    ResolversParentTypes["PHDocument"] = ResolversParentTypes["PHDocument"],
> = ResolversObject<{
  created?: Resolver<ResolversTypes["DateTime"], ParentType, ContextType>;
  documentType?: Resolver<ResolversTypes["String"], ParentType, ContextType>;
  id?: Resolver<ResolversTypes["String"], ParentType, ContextType>;
  lastModified?: Resolver<ResolversTypes["DateTime"], ParentType, ContextType>;
  name?: Resolver<ResolversTypes["String"], ParentType, ContextType>;
  parentId?: Resolver<Maybe<ResolversTypes["String"]>, ParentType, ContextType>;
  revision?: Resolver<ResolversTypes["Int"], ParentType, ContextType>;
  slug?: Resolver<Maybe<ResolversTypes["String"]>, ParentType, ContextType>;
  state?: Resolver<ResolversTypes["JSONObject"], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type PhDocumentResultPageResolvers<
  ContextType = Context,
  ParentType extends
    ResolversParentTypes["PHDocumentResultPage"] = ResolversParentTypes["PHDocumentResultPage"],
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
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type QueryResolvers<
  ContextType = Context,
  ParentType extends
    ResolversParentTypes["Query"] = ResolversParentTypes["Query"],
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
}>;

export type SignerResolvers<
  ContextType = Context,
  ParentType extends
    ResolversParentTypes["Signer"] = ResolversParentTypes["Signer"],
> = ResolversObject<{
  app?: Resolver<Maybe<ResolversTypes["SignerApp"]>, ParentType, ContextType>;
  signatures?: Resolver<
    ReadonlyArray<ResolversTypes["String"]>,
    ParentType,
    ContextType
  >;
  user?: Resolver<Maybe<ResolversTypes["SignerUser"]>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type SignerAppResolvers<
  ContextType = Context,
  ParentType extends
    ResolversParentTypes["SignerApp"] = ResolversParentTypes["SignerApp"],
> = ResolversObject<{
  key?: Resolver<ResolversTypes["String"], ParentType, ContextType>;
  name?: Resolver<ResolversTypes["String"], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type SignerUserResolvers<
  ContextType = Context,
  ParentType extends
    ResolversParentTypes["SignerUser"] = ResolversParentTypes["SignerUser"],
> = ResolversObject<{
  address?: Resolver<ResolversTypes["String"], ParentType, ContextType>;
  chainId?: Resolver<ResolversTypes["Int"], ParentType, ContextType>;
  networkId?: Resolver<ResolversTypes["String"], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type SubscriptionResolvers<
  ContextType = Context,
  ParentType extends
    ResolversParentTypes["Subscription"] = ResolversParentTypes["Subscription"],
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

export type Resolvers<ContextType = Context> = ResolversObject<{
  Action?: ActionResolvers<ContextType>;
  ActionContext?: ActionContextResolvers<ContextType>;
  AttachmentInput?: AttachmentInputResolvers<ContextType>;
  DateTime?: GraphQLScalarType;
  DocumentChangeContext?: DocumentChangeContextResolvers<ContextType>;
  DocumentChangeEvent?: DocumentChangeEventResolvers<ContextType>;
  DocumentModelResultPage?: DocumentModelResultPageResolvers<ContextType>;
  DocumentModelState?: DocumentModelStateResolvers<ContextType>;
  DocumentWithChildren?: DocumentWithChildrenResolvers<ContextType>;
  JSONObject?: GraphQLScalarType;
  JobChangeEvent?: JobChangeEventResolvers<ContextType>;
  JobInfo?: JobInfoResolvers<ContextType>;
  MoveChildrenResult?: MoveChildrenResultResolvers<ContextType>;
  Mutation?: MutationResolvers<ContextType>;
  PHDocument?: PhDocumentResolvers<ContextType>;
  PHDocumentResultPage?: PhDocumentResultPageResolvers<ContextType>;
  Query?: QueryResolvers<ContextType>;
  Signer?: SignerResolvers<ContextType>;
  SignerApp?: SignerAppResolvers<ContextType>;
  SignerUser?: SignerUserResolvers<ContextType>;
  Subscription?: SubscriptionResolvers<ContextType>;
}>;

type Properties<T> = Required<{
  [K in keyof T]: z.ZodType<T[K], any, T[K]>;
}>;

type definedNonNullAny = {};

export const isDefinedNonNullAny = (v: any): v is definedNonNullAny =>
  v !== undefined && v !== null;

export const definedNonNullAnySchema = z
  .any()
  .refine((v) => isDefinedNonNullAny(v));

export const DocumentChangeTypeSchema = z.nativeEnum(DocumentChangeType);

export const PropagationModeSchema = z.nativeEnum(PropagationMode);

export function PagingInputSchema(): z.ZodObject<Properties<PagingInput>> {
  return z.object({
    cursor: z.string().nullish(),
    limit: z.number().nullish(),
    offset: z.number().nullish(),
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
    revision
    created
    lastModified
    parentId
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
    $view: ViewFilterInput
  ) {
    renameDocument(
      documentIdentifier: $documentIdentifier
      name: $name
      view: $view
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
    $view: ViewFilterInput
  ) {
    addChildren(
      parentIdentifier: $parentIdentifier
      documentIdentifiers: $documentIdentifiers
      view: $view
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
    $view: ViewFilterInput
  ) {
    removeChildren(
      parentIdentifier: $parentIdentifier
      documentIdentifiers: $documentIdentifiers
      view: $view
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
    $view: ViewFilterInput
  ) {
    moveChildren(
      sourceParentIdentifier: $sourceParentIdentifier
      targetParentIdentifier: $targetParentIdentifier
      documentIdentifiers: $documentIdentifiers
      view: $view
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
  };
}
export type Sdk = ReturnType<typeof getSdk>;
