/* eslint-disable */
import * as Types from "./graphql.js";
import { DocumentNode } from "graphql";
export type Maybe<T> = T | null;
export type InputMaybe<T> = Maybe<T>;
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
  DateTime: { input: any; output: any };
  JSONObject: { input: any; output: any };
};

export type Action = {
  __typename?: "Action";
  attachments?: Maybe<Array<AttachmentInput>>;
  context?: Maybe<ActionContext>;
  id: Scalars["String"]["output"];
  input?: Maybe<Scalars["JSONObject"]["output"]>;
  scope: Scalars["String"]["output"];
  timestampUtcMs: Scalars["String"]["output"];
  type: Scalars["String"]["output"];
};

export type ActionContext = {
  __typename?: "ActionContext";
  signer?: Maybe<Signer>;
};

export type AttachmentInput = {
  __typename?: "AttachmentInput";
  data: Scalars["String"]["output"];
  extension?: Maybe<Scalars["String"]["output"]>;
  fileName?: Maybe<Scalars["String"]["output"]>;
  hash: Scalars["String"]["output"];
  mimeType: Scalars["String"]["output"];
};

export type DocumentChangeContext = {
  __typename?: "DocumentChangeContext";
  childId?: Maybe<Scalars["String"]["output"]>;
  parentId?: Maybe<Scalars["String"]["output"]>;
};

export type DocumentChangeEvent = {
  __typename?: "DocumentChangeEvent";
  context?: Maybe<DocumentChangeContext>;
  documents: Array<PhDocument>;
  type: DocumentChangeType;
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
  __typename?: "DocumentModelResultPage";
  cursor?: Maybe<Scalars["String"]["output"]>;
  hasNextPage: Scalars["Boolean"]["output"];
  hasPreviousPage: Scalars["Boolean"]["output"];
  items: Array<DocumentModelState>;
  totalCount: Scalars["Int"]["output"];
};

export type DocumentModelState = {
  __typename?: "DocumentModelState";
  id: Scalars["String"]["output"];
  name: Scalars["String"]["output"];
  namespace?: Maybe<Scalars["String"]["output"]>;
  specification?: Maybe<Scalars["JSONObject"]["output"]>;
  version?: Maybe<Scalars["String"]["output"]>;
};

export type DocumentWithChildren = {
  __typename?: "DocumentWithChildren";
  childIds: Array<Scalars["String"]["output"]>;
  document: PhDocument;
};

export type JobChangeEvent = {
  __typename?: "JobChangeEvent";
  error?: Maybe<Scalars["String"]["output"]>;
  jobId: Scalars["String"]["output"];
  result?: Maybe<Scalars["JSONObject"]["output"]>;
  status: Scalars["String"]["output"];
};

export type JobInfo = {
  __typename?: "JobInfo";
  completedAt?: Maybe<Scalars["DateTime"]["output"]>;
  createdAt: Scalars["DateTime"]["output"];
  error?: Maybe<Scalars["String"]["output"]>;
  id: Scalars["String"]["output"];
  result?: Maybe<Scalars["JSONObject"]["output"]>;
  status: Scalars["String"]["output"];
};

export type MoveChildrenResult = {
  __typename?: "MoveChildrenResult";
  source: PhDocument;
  target: PhDocument;
};

export type Mutation = {
  __typename?: "Mutation";
  addChildren: PhDocument;
  createDocument: PhDocument;
  createEmptyDocument: PhDocument;
  deleteDocument: Scalars["Boolean"]["output"];
  deleteDocuments: Scalars["Boolean"]["output"];
  moveChildren: MoveChildrenResult;
  mutateDocument: PhDocument;
  mutateDocumentAsync: Scalars["String"]["output"];
  removeChildren: PhDocument;
  renameDocument: PhDocument;
};

export type MutationAddChildrenArgs = {
  documentIdentifiers: Array<Scalars["String"]["input"]>;
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
  identifiers: Array<Scalars["String"]["input"]>;
  propagate?: InputMaybe<PropagationMode>;
};

export type MutationMoveChildrenArgs = {
  documentIdentifiers: Array<Scalars["String"]["input"]>;
  sourceParentIdentifier: Scalars["String"]["input"];
  targetParentIdentifier: Scalars["String"]["input"];
  view?: InputMaybe<ViewFilterInput>;
};

export type MutationMutateDocumentArgs = {
  actions: Array<Scalars["JSONObject"]["input"]>;
  documentIdentifier: Scalars["String"]["input"];
  view?: InputMaybe<ViewFilterInput>;
};

export type MutationMutateDocumentAsyncArgs = {
  actions: Array<Scalars["JSONObject"]["input"]>;
  documentIdentifier: Scalars["String"]["input"];
  view?: InputMaybe<ViewFilterInput>;
};

export type MutationRemoveChildrenArgs = {
  documentIdentifiers: Array<Scalars["String"]["input"]>;
  parentIdentifier: Scalars["String"]["input"];
  view?: InputMaybe<ViewFilterInput>;
};

export type MutationRenameDocumentArgs = {
  documentIdentifier: Scalars["String"]["input"];
  name: Scalars["String"]["input"];
  view?: InputMaybe<ViewFilterInput>;
};

export type PhDocument = {
  __typename?: "PHDocument";
  created: Scalars["DateTime"]["output"];
  documentType: Scalars["String"]["output"];
  id: Scalars["String"]["output"];
  lastModified: Scalars["DateTime"]["output"];
  name: Scalars["String"]["output"];
  parentId?: Maybe<Scalars["String"]["output"]>;
  revision: Scalars["Int"]["output"];
  slug?: Maybe<Scalars["String"]["output"]>;
  state: Scalars["JSONObject"]["output"];
};

export type PhDocumentResultPage = {
  __typename?: "PHDocumentResultPage";
  cursor?: Maybe<Scalars["String"]["output"]>;
  hasNextPage: Scalars["Boolean"]["output"];
  hasPreviousPage: Scalars["Boolean"]["output"];
  items: Array<PhDocument>;
  totalCount: Scalars["Int"]["output"];
};

export type PagingInput = {
  cursor?: InputMaybe<Scalars["String"]["input"]>;
  limit?: InputMaybe<Scalars["Int"]["input"]>;
  offset?: InputMaybe<Scalars["Int"]["input"]>;
};

export enum PropagationMode {
  Cascade = "CASCADE",
  Orphan = "ORPHAN",
}

export type Query = {
  __typename?: "Query";
  document?: Maybe<DocumentWithChildren>;
  documentChildren: PhDocumentResultPage;
  documentModels: DocumentModelResultPage;
  documentParents: PhDocumentResultPage;
  findDocuments: PhDocumentResultPage;
  jobStatus?: Maybe<JobInfo>;
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
  identifiers?: InputMaybe<Array<Scalars["String"]["input"]>>;
  parentId?: InputMaybe<Scalars["String"]["input"]>;
  type?: InputMaybe<Scalars["String"]["input"]>;
};

export type Signer = {
  __typename?: "Signer";
  app?: Maybe<SignerApp>;
  signatures: Array<Scalars["String"]["output"]>;
  user?: Maybe<SignerUser>;
};

export type SignerApp = {
  __typename?: "SignerApp";
  key: Scalars["String"]["output"];
  name: Scalars["String"]["output"];
};

export type SignerUser = {
  __typename?: "SignerUser";
  address: Scalars["String"]["output"];
  chainId: Scalars["Int"]["output"];
  networkId: Scalars["String"]["output"];
};

export type Subscription = {
  __typename?: "Subscription";
  documentChanges: DocumentChangeEvent;
  jobChanges: JobChangeEvent;
};

export type SubscriptionDocumentChangesArgs = {
  search: SearchFilterInput;
  view?: InputMaybe<ViewFilterInput>;
};

export type SubscriptionJobChangesArgs = {
  jobId: Scalars["String"]["input"];
};

export type ViewFilterInput = {
  branch?: InputMaybe<Scalars["String"]["input"]>;
  scopes?: InputMaybe<Array<Scalars["String"]["input"]>>;
};

export type PhDocumentFieldsFragment = {
  __typename?: "PHDocument";
  id: string;
  slug?: string | null;
  name: string;
  documentType: string;
  state: any;
  revision: number;
  created: any;
  lastModified: any;
  parentId?: string | null;
};

export type GetDocumentModelsQueryVariables = Exact<{
  namespace?: InputMaybe<Scalars["String"]["input"]>;
  paging?: InputMaybe<PagingInput>;
}>;

export type GetDocumentModelsQuery = {
  __typename?: "Query";
  documentModels: {
    __typename?: "DocumentModelResultPage";
    totalCount: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
    cursor?: string | null;
    items: Array<{
      __typename?: "DocumentModelState";
      id: string;
      name: string;
      namespace?: string | null;
      version?: string | null;
      specification?: any | null;
    }>;
  };
};

export type GetDocumentQueryVariables = Exact<{
  identifier: Scalars["String"]["input"];
  view?: InputMaybe<ViewFilterInput>;
}>;

export type GetDocumentQuery = {
  __typename?: "Query";
  document?: {
    __typename?: "DocumentWithChildren";
    childIds: Array<string>;
    document: {
      __typename?: "PHDocument";
      id: string;
      slug?: string | null;
      name: string;
      documentType: string;
      state: any;
      revision: number;
      created: any;
      lastModified: any;
      parentId?: string | null;
    };
  } | null;
};

export type GetDocumentChildrenQueryVariables = Exact<{
  parentIdentifier: Scalars["String"]["input"];
  view?: InputMaybe<ViewFilterInput>;
  paging?: InputMaybe<PagingInput>;
}>;

export type GetDocumentChildrenQuery = {
  __typename?: "Query";
  documentChildren: {
    __typename?: "PHDocumentResultPage";
    totalCount: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
    cursor?: string | null;
    items: Array<{
      __typename?: "PHDocument";
      id: string;
      slug?: string | null;
      name: string;
      documentType: string;
      state: any;
      revision: number;
      created: any;
      lastModified: any;
      parentId?: string | null;
    }>;
  };
};

export type GetDocumentParentsQueryVariables = Exact<{
  childIdentifier: Scalars["String"]["input"];
  view?: InputMaybe<ViewFilterInput>;
  paging?: InputMaybe<PagingInput>;
}>;

export type GetDocumentParentsQuery = {
  __typename?: "Query";
  documentParents: {
    __typename?: "PHDocumentResultPage";
    totalCount: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
    cursor?: string | null;
    items: Array<{
      __typename?: "PHDocument";
      id: string;
      slug?: string | null;
      name: string;
      documentType: string;
      state: any;
      revision: number;
      created: any;
      lastModified: any;
      parentId?: string | null;
    }>;
  };
};

export type FindDocumentsQueryVariables = Exact<{
  search: SearchFilterInput;
  view?: InputMaybe<ViewFilterInput>;
  paging?: InputMaybe<PagingInput>;
}>;

export type FindDocumentsQuery = {
  __typename?: "Query";
  findDocuments: {
    __typename?: "PHDocumentResultPage";
    totalCount: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
    cursor?: string | null;
    items: Array<{
      __typename?: "PHDocument";
      id: string;
      slug?: string | null;
      name: string;
      documentType: string;
      state: any;
      revision: number;
      created: any;
      lastModified: any;
      parentId?: string | null;
    }>;
  };
};

export type GetJobStatusQueryVariables = Exact<{
  jobId: Scalars["String"]["input"];
}>;

export type GetJobStatusQuery = {
  __typename?: "Query";
  jobStatus?: {
    __typename?: "JobInfo";
    id: string;
    status: string;
    result?: any | null;
    error?: string | null;
    createdAt: any;
    completedAt?: any | null;
  } | null;
};

export type CreateDocumentMutationVariables = Exact<{
  document: Scalars["JSONObject"]["input"];
  parentIdentifier?: InputMaybe<Scalars["String"]["input"]>;
}>;

export type CreateDocumentMutation = {
  __typename?: "Mutation";
  createDocument: {
    __typename?: "PHDocument";
    id: string;
    slug?: string | null;
    name: string;
    documentType: string;
    state: any;
    revision: number;
    created: any;
    lastModified: any;
    parentId?: string | null;
  };
};

export type CreateEmptyDocumentMutationVariables = Exact<{
  documentType: Scalars["String"]["input"];
  parentIdentifier?: InputMaybe<Scalars["String"]["input"]>;
}>;

export type CreateEmptyDocumentMutation = {
  __typename?: "Mutation";
  createEmptyDocument: {
    __typename?: "PHDocument";
    id: string;
    slug?: string | null;
    name: string;
    documentType: string;
    state: any;
    revision: number;
    created: any;
    lastModified: any;
    parentId?: string | null;
  };
};

export type MutateDocumentMutationVariables = Exact<{
  documentIdentifier: Scalars["String"]["input"];
  actions:
    | Array<Scalars["JSONObject"]["input"]>
    | Scalars["JSONObject"]["input"];
  view?: InputMaybe<ViewFilterInput>;
}>;

export type MutateDocumentMutation = {
  __typename?: "Mutation";
  mutateDocument: {
    __typename?: "PHDocument";
    id: string;
    slug?: string | null;
    name: string;
    documentType: string;
    state: any;
    revision: number;
    created: any;
    lastModified: any;
    parentId?: string | null;
  };
};

export type MutateDocumentAsyncMutationVariables = Exact<{
  documentIdentifier: Scalars["String"]["input"];
  actions:
    | Array<Scalars["JSONObject"]["input"]>
    | Scalars["JSONObject"]["input"];
  view?: InputMaybe<ViewFilterInput>;
}>;

export type MutateDocumentAsyncMutation = {
  __typename?: "Mutation";
  mutateDocumentAsync: string;
};

export type RenameDocumentMutationVariables = Exact<{
  documentIdentifier: Scalars["String"]["input"];
  name: Scalars["String"]["input"];
  view?: InputMaybe<ViewFilterInput>;
}>;

export type RenameDocumentMutation = {
  __typename?: "Mutation";
  renameDocument: {
    __typename?: "PHDocument";
    id: string;
    slug?: string | null;
    name: string;
    documentType: string;
    state: any;
    revision: number;
    created: any;
    lastModified: any;
    parentId?: string | null;
  };
};

export type AddChildrenMutationVariables = Exact<{
  parentIdentifier: Scalars["String"]["input"];
  documentIdentifiers:
    | Array<Scalars["String"]["input"]>
    | Scalars["String"]["input"];
  view?: InputMaybe<ViewFilterInput>;
}>;

export type AddChildrenMutation = {
  __typename?: "Mutation";
  addChildren: {
    __typename?: "PHDocument";
    id: string;
    slug?: string | null;
    name: string;
    documentType: string;
    state: any;
    revision: number;
    created: any;
    lastModified: any;
    parentId?: string | null;
  };
};

export type RemoveChildrenMutationVariables = Exact<{
  parentIdentifier: Scalars["String"]["input"];
  documentIdentifiers:
    | Array<Scalars["String"]["input"]>
    | Scalars["String"]["input"];
  view?: InputMaybe<ViewFilterInput>;
}>;

export type RemoveChildrenMutation = {
  __typename?: "Mutation";
  removeChildren: {
    __typename?: "PHDocument";
    id: string;
    slug?: string | null;
    name: string;
    documentType: string;
    state: any;
    revision: number;
    created: any;
    lastModified: any;
    parentId?: string | null;
  };
};

export type MoveChildrenMutationVariables = Exact<{
  sourceParentIdentifier: Scalars["String"]["input"];
  targetParentIdentifier: Scalars["String"]["input"];
  documentIdentifiers:
    | Array<Scalars["String"]["input"]>
    | Scalars["String"]["input"];
  view?: InputMaybe<ViewFilterInput>;
}>;

export type MoveChildrenMutation = {
  __typename?: "Mutation";
  moveChildren: {
    __typename?: "MoveChildrenResult";
    source: {
      __typename?: "PHDocument";
      id: string;
      slug?: string | null;
      name: string;
      documentType: string;
      state: any;
      revision: number;
      created: any;
      lastModified: any;
      parentId?: string | null;
    };
    target: {
      __typename?: "PHDocument";
      id: string;
      slug?: string | null;
      name: string;
      documentType: string;
      state: any;
      revision: number;
      created: any;
      lastModified: any;
      parentId?: string | null;
    };
  };
};

export type DeleteDocumentMutationVariables = Exact<{
  identifier: Scalars["String"]["input"];
  propagate?: InputMaybe<PropagationMode>;
}>;

export type DeleteDocumentMutation = {
  __typename?: "Mutation";
  deleteDocument: boolean;
};

export type DeleteDocumentsMutationVariables = Exact<{
  identifiers: Array<Scalars["String"]["input"]> | Scalars["String"]["input"];
  propagate?: InputMaybe<PropagationMode>;
}>;

export type DeleteDocumentsMutation = {
  __typename?: "Mutation";
  deleteDocuments: boolean;
};

export type DocumentChangesSubscriptionVariables = Exact<{
  search: SearchFilterInput;
  view?: InputMaybe<ViewFilterInput>;
}>;

export type DocumentChangesSubscription = {
  __typename?: "Subscription";
  documentChanges: {
    __typename?: "DocumentChangeEvent";
    type: DocumentChangeType;
    documents: Array<{
      __typename?: "PHDocument";
      id: string;
      slug?: string | null;
      name: string;
      documentType: string;
      state: any;
      revision: number;
      created: any;
      lastModified: any;
      parentId?: string | null;
    }>;
    context?: {
      __typename?: "DocumentChangeContext";
      parentId?: string | null;
      childId?: string | null;
    } | null;
  };
};

export type JobChangesSubscriptionVariables = Exact<{
  jobId: Scalars["String"]["input"];
}>;

export type JobChangesSubscription = {
  __typename?: "Subscription";
  jobChanges: {
    __typename?: "JobChangeEvent";
    jobId: string;
    status: string;
    result?: any | null;
    error?: string | null;
  };
};

export const PhDocumentFieldsFragmentDoc = {
  kind: "Document",
  definitions: [
    {
      kind: "FragmentDefinition",
      name: { kind: "Name", value: "PHDocumentFields" },
      typeCondition: {
        kind: "NamedType",
        name: { kind: "Name", value: "PHDocument" },
      },
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          { kind: "Field", name: { kind: "Name", value: "id" } },
          { kind: "Field", name: { kind: "Name", value: "slug" } },
          { kind: "Field", name: { kind: "Name", value: "name" } },
          { kind: "Field", name: { kind: "Name", value: "documentType" } },
          { kind: "Field", name: { kind: "Name", value: "state" } },
          { kind: "Field", name: { kind: "Name", value: "revision" } },
          { kind: "Field", name: { kind: "Name", value: "created" } },
          { kind: "Field", name: { kind: "Name", value: "lastModified" } },
          { kind: "Field", name: { kind: "Name", value: "parentId" } },
        ],
      },
    },
  ],
} as unknown as DocumentNode;
export const GetDocumentModelsDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "query",
      name: { kind: "Name", value: "GetDocumentModels" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: {
            kind: "Variable",
            name: { kind: "Name", value: "namespace" },
          },
          type: { kind: "NamedType", name: { kind: "Name", value: "String" } },
        },
        {
          kind: "VariableDefinition",
          variable: {
            kind: "Variable",
            name: { kind: "Name", value: "paging" },
          },
          type: {
            kind: "NamedType",
            name: { kind: "Name", value: "PagingInput" },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "documentModels" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "namespace" },
                value: {
                  kind: "Variable",
                  name: { kind: "Name", value: "namespace" },
                },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "paging" },
                value: {
                  kind: "Variable",
                  name: { kind: "Name", value: "paging" },
                },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                {
                  kind: "Field",
                  name: { kind: "Name", value: "items" },
                  selectionSet: {
                    kind: "SelectionSet",
                    selections: [
                      { kind: "Field", name: { kind: "Name", value: "id" } },
                      { kind: "Field", name: { kind: "Name", value: "name" } },
                      {
                        kind: "Field",
                        name: { kind: "Name", value: "namespace" },
                      },
                      {
                        kind: "Field",
                        name: { kind: "Name", value: "version" },
                      },
                      {
                        kind: "Field",
                        name: { kind: "Name", value: "specification" },
                      },
                    ],
                  },
                },
                { kind: "Field", name: { kind: "Name", value: "totalCount" } },
                { kind: "Field", name: { kind: "Name", value: "hasNextPage" } },
                {
                  kind: "Field",
                  name: { kind: "Name", value: "hasPreviousPage" },
                },
                { kind: "Field", name: { kind: "Name", value: "cursor" } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode;
export const GetDocumentDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "query",
      name: { kind: "Name", value: "GetDocument" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: {
            kind: "Variable",
            name: { kind: "Name", value: "identifier" },
          },
          type: {
            kind: "NonNullType",
            type: {
              kind: "NamedType",
              name: { kind: "Name", value: "String" },
            },
          },
        },
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "view" } },
          type: {
            kind: "NamedType",
            name: { kind: "Name", value: "ViewFilterInput" },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "document" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "identifier" },
                value: {
                  kind: "Variable",
                  name: { kind: "Name", value: "identifier" },
                },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "view" },
                value: {
                  kind: "Variable",
                  name: { kind: "Name", value: "view" },
                },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                {
                  kind: "Field",
                  name: { kind: "Name", value: "document" },
                  selectionSet: {
                    kind: "SelectionSet",
                    selections: [
                      {
                        kind: "FragmentSpread",
                        name: { kind: "Name", value: "PHDocumentFields" },
                      },
                    ],
                  },
                },
                { kind: "Field", name: { kind: "Name", value: "childIds" } },
              ],
            },
          },
        ],
      },
    },
    {
      kind: "FragmentDefinition",
      name: { kind: "Name", value: "PHDocumentFields" },
      typeCondition: {
        kind: "NamedType",
        name: { kind: "Name", value: "PHDocument" },
      },
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          { kind: "Field", name: { kind: "Name", value: "id" } },
          { kind: "Field", name: { kind: "Name", value: "slug" } },
          { kind: "Field", name: { kind: "Name", value: "name" } },
          { kind: "Field", name: { kind: "Name", value: "documentType" } },
          { kind: "Field", name: { kind: "Name", value: "state" } },
          { kind: "Field", name: { kind: "Name", value: "revision" } },
          { kind: "Field", name: { kind: "Name", value: "created" } },
          { kind: "Field", name: { kind: "Name", value: "lastModified" } },
          { kind: "Field", name: { kind: "Name", value: "parentId" } },
        ],
      },
    },
  ],
} as unknown as DocumentNode;
export const GetDocumentChildrenDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "query",
      name: { kind: "Name", value: "GetDocumentChildren" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: {
            kind: "Variable",
            name: { kind: "Name", value: "parentIdentifier" },
          },
          type: {
            kind: "NonNullType",
            type: {
              kind: "NamedType",
              name: { kind: "Name", value: "String" },
            },
          },
        },
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "view" } },
          type: {
            kind: "NamedType",
            name: { kind: "Name", value: "ViewFilterInput" },
          },
        },
        {
          kind: "VariableDefinition",
          variable: {
            kind: "Variable",
            name: { kind: "Name", value: "paging" },
          },
          type: {
            kind: "NamedType",
            name: { kind: "Name", value: "PagingInput" },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "documentChildren" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "parentIdentifier" },
                value: {
                  kind: "Variable",
                  name: { kind: "Name", value: "parentIdentifier" },
                },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "view" },
                value: {
                  kind: "Variable",
                  name: { kind: "Name", value: "view" },
                },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "paging" },
                value: {
                  kind: "Variable",
                  name: { kind: "Name", value: "paging" },
                },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                {
                  kind: "Field",
                  name: { kind: "Name", value: "items" },
                  selectionSet: {
                    kind: "SelectionSet",
                    selections: [
                      {
                        kind: "FragmentSpread",
                        name: { kind: "Name", value: "PHDocumentFields" },
                      },
                    ],
                  },
                },
                { kind: "Field", name: { kind: "Name", value: "totalCount" } },
                { kind: "Field", name: { kind: "Name", value: "hasNextPage" } },
                {
                  kind: "Field",
                  name: { kind: "Name", value: "hasPreviousPage" },
                },
                { kind: "Field", name: { kind: "Name", value: "cursor" } },
              ],
            },
          },
        ],
      },
    },
    {
      kind: "FragmentDefinition",
      name: { kind: "Name", value: "PHDocumentFields" },
      typeCondition: {
        kind: "NamedType",
        name: { kind: "Name", value: "PHDocument" },
      },
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          { kind: "Field", name: { kind: "Name", value: "id" } },
          { kind: "Field", name: { kind: "Name", value: "slug" } },
          { kind: "Field", name: { kind: "Name", value: "name" } },
          { kind: "Field", name: { kind: "Name", value: "documentType" } },
          { kind: "Field", name: { kind: "Name", value: "state" } },
          { kind: "Field", name: { kind: "Name", value: "revision" } },
          { kind: "Field", name: { kind: "Name", value: "created" } },
          { kind: "Field", name: { kind: "Name", value: "lastModified" } },
          { kind: "Field", name: { kind: "Name", value: "parentId" } },
        ],
      },
    },
  ],
} as unknown as DocumentNode;
export const GetDocumentParentsDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "query",
      name: { kind: "Name", value: "GetDocumentParents" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: {
            kind: "Variable",
            name: { kind: "Name", value: "childIdentifier" },
          },
          type: {
            kind: "NonNullType",
            type: {
              kind: "NamedType",
              name: { kind: "Name", value: "String" },
            },
          },
        },
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "view" } },
          type: {
            kind: "NamedType",
            name: { kind: "Name", value: "ViewFilterInput" },
          },
        },
        {
          kind: "VariableDefinition",
          variable: {
            kind: "Variable",
            name: { kind: "Name", value: "paging" },
          },
          type: {
            kind: "NamedType",
            name: { kind: "Name", value: "PagingInput" },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "documentParents" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "childIdentifier" },
                value: {
                  kind: "Variable",
                  name: { kind: "Name", value: "childIdentifier" },
                },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "view" },
                value: {
                  kind: "Variable",
                  name: { kind: "Name", value: "view" },
                },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "paging" },
                value: {
                  kind: "Variable",
                  name: { kind: "Name", value: "paging" },
                },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                {
                  kind: "Field",
                  name: { kind: "Name", value: "items" },
                  selectionSet: {
                    kind: "SelectionSet",
                    selections: [
                      {
                        kind: "FragmentSpread",
                        name: { kind: "Name", value: "PHDocumentFields" },
                      },
                    ],
                  },
                },
                { kind: "Field", name: { kind: "Name", value: "totalCount" } },
                { kind: "Field", name: { kind: "Name", value: "hasNextPage" } },
                {
                  kind: "Field",
                  name: { kind: "Name", value: "hasPreviousPage" },
                },
                { kind: "Field", name: { kind: "Name", value: "cursor" } },
              ],
            },
          },
        ],
      },
    },
    {
      kind: "FragmentDefinition",
      name: { kind: "Name", value: "PHDocumentFields" },
      typeCondition: {
        kind: "NamedType",
        name: { kind: "Name", value: "PHDocument" },
      },
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          { kind: "Field", name: { kind: "Name", value: "id" } },
          { kind: "Field", name: { kind: "Name", value: "slug" } },
          { kind: "Field", name: { kind: "Name", value: "name" } },
          { kind: "Field", name: { kind: "Name", value: "documentType" } },
          { kind: "Field", name: { kind: "Name", value: "state" } },
          { kind: "Field", name: { kind: "Name", value: "revision" } },
          { kind: "Field", name: { kind: "Name", value: "created" } },
          { kind: "Field", name: { kind: "Name", value: "lastModified" } },
          { kind: "Field", name: { kind: "Name", value: "parentId" } },
        ],
      },
    },
  ],
} as unknown as DocumentNode;
export const FindDocumentsDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "query",
      name: { kind: "Name", value: "FindDocuments" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: {
            kind: "Variable",
            name: { kind: "Name", value: "search" },
          },
          type: {
            kind: "NonNullType",
            type: {
              kind: "NamedType",
              name: { kind: "Name", value: "SearchFilterInput" },
            },
          },
        },
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "view" } },
          type: {
            kind: "NamedType",
            name: { kind: "Name", value: "ViewFilterInput" },
          },
        },
        {
          kind: "VariableDefinition",
          variable: {
            kind: "Variable",
            name: { kind: "Name", value: "paging" },
          },
          type: {
            kind: "NamedType",
            name: { kind: "Name", value: "PagingInput" },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "findDocuments" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "search" },
                value: {
                  kind: "Variable",
                  name: { kind: "Name", value: "search" },
                },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "view" },
                value: {
                  kind: "Variable",
                  name: { kind: "Name", value: "view" },
                },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "paging" },
                value: {
                  kind: "Variable",
                  name: { kind: "Name", value: "paging" },
                },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                {
                  kind: "Field",
                  name: { kind: "Name", value: "items" },
                  selectionSet: {
                    kind: "SelectionSet",
                    selections: [
                      {
                        kind: "FragmentSpread",
                        name: { kind: "Name", value: "PHDocumentFields" },
                      },
                    ],
                  },
                },
                { kind: "Field", name: { kind: "Name", value: "totalCount" } },
                { kind: "Field", name: { kind: "Name", value: "hasNextPage" } },
                {
                  kind: "Field",
                  name: { kind: "Name", value: "hasPreviousPage" },
                },
                { kind: "Field", name: { kind: "Name", value: "cursor" } },
              ],
            },
          },
        ],
      },
    },
    {
      kind: "FragmentDefinition",
      name: { kind: "Name", value: "PHDocumentFields" },
      typeCondition: {
        kind: "NamedType",
        name: { kind: "Name", value: "PHDocument" },
      },
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          { kind: "Field", name: { kind: "Name", value: "id" } },
          { kind: "Field", name: { kind: "Name", value: "slug" } },
          { kind: "Field", name: { kind: "Name", value: "name" } },
          { kind: "Field", name: { kind: "Name", value: "documentType" } },
          { kind: "Field", name: { kind: "Name", value: "state" } },
          { kind: "Field", name: { kind: "Name", value: "revision" } },
          { kind: "Field", name: { kind: "Name", value: "created" } },
          { kind: "Field", name: { kind: "Name", value: "lastModified" } },
          { kind: "Field", name: { kind: "Name", value: "parentId" } },
        ],
      },
    },
  ],
} as unknown as DocumentNode;
export const GetJobStatusDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "query",
      name: { kind: "Name", value: "GetJobStatus" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: {
            kind: "Variable",
            name: { kind: "Name", value: "jobId" },
          },
          type: {
            kind: "NonNullType",
            type: {
              kind: "NamedType",
              name: { kind: "Name", value: "String" },
            },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "jobStatus" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "jobId" },
                value: {
                  kind: "Variable",
                  name: { kind: "Name", value: "jobId" },
                },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "id" } },
                { kind: "Field", name: { kind: "Name", value: "status" } },
                { kind: "Field", name: { kind: "Name", value: "result" } },
                { kind: "Field", name: { kind: "Name", value: "error" } },
                { kind: "Field", name: { kind: "Name", value: "createdAt" } },
                { kind: "Field", name: { kind: "Name", value: "completedAt" } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode;
export const CreateDocumentDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "mutation",
      name: { kind: "Name", value: "CreateDocument" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: {
            kind: "Variable",
            name: { kind: "Name", value: "document" },
          },
          type: {
            kind: "NonNullType",
            type: {
              kind: "NamedType",
              name: { kind: "Name", value: "JSONObject" },
            },
          },
        },
        {
          kind: "VariableDefinition",
          variable: {
            kind: "Variable",
            name: { kind: "Name", value: "parentIdentifier" },
          },
          type: { kind: "NamedType", name: { kind: "Name", value: "String" } },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "createDocument" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "document" },
                value: {
                  kind: "Variable",
                  name: { kind: "Name", value: "document" },
                },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "parentIdentifier" },
                value: {
                  kind: "Variable",
                  name: { kind: "Name", value: "parentIdentifier" },
                },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                {
                  kind: "FragmentSpread",
                  name: { kind: "Name", value: "PHDocumentFields" },
                },
              ],
            },
          },
        ],
      },
    },
    {
      kind: "FragmentDefinition",
      name: { kind: "Name", value: "PHDocumentFields" },
      typeCondition: {
        kind: "NamedType",
        name: { kind: "Name", value: "PHDocument" },
      },
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          { kind: "Field", name: { kind: "Name", value: "id" } },
          { kind: "Field", name: { kind: "Name", value: "slug" } },
          { kind: "Field", name: { kind: "Name", value: "name" } },
          { kind: "Field", name: { kind: "Name", value: "documentType" } },
          { kind: "Field", name: { kind: "Name", value: "state" } },
          { kind: "Field", name: { kind: "Name", value: "revision" } },
          { kind: "Field", name: { kind: "Name", value: "created" } },
          { kind: "Field", name: { kind: "Name", value: "lastModified" } },
          { kind: "Field", name: { kind: "Name", value: "parentId" } },
        ],
      },
    },
  ],
} as unknown as DocumentNode;
export const CreateEmptyDocumentDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "mutation",
      name: { kind: "Name", value: "CreateEmptyDocument" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: {
            kind: "Variable",
            name: { kind: "Name", value: "documentType" },
          },
          type: {
            kind: "NonNullType",
            type: {
              kind: "NamedType",
              name: { kind: "Name", value: "String" },
            },
          },
        },
        {
          kind: "VariableDefinition",
          variable: {
            kind: "Variable",
            name: { kind: "Name", value: "parentIdentifier" },
          },
          type: { kind: "NamedType", name: { kind: "Name", value: "String" } },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "createEmptyDocument" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "documentType" },
                value: {
                  kind: "Variable",
                  name: { kind: "Name", value: "documentType" },
                },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "parentIdentifier" },
                value: {
                  kind: "Variable",
                  name: { kind: "Name", value: "parentIdentifier" },
                },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                {
                  kind: "FragmentSpread",
                  name: { kind: "Name", value: "PHDocumentFields" },
                },
              ],
            },
          },
        ],
      },
    },
    {
      kind: "FragmentDefinition",
      name: { kind: "Name", value: "PHDocumentFields" },
      typeCondition: {
        kind: "NamedType",
        name: { kind: "Name", value: "PHDocument" },
      },
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          { kind: "Field", name: { kind: "Name", value: "id" } },
          { kind: "Field", name: { kind: "Name", value: "slug" } },
          { kind: "Field", name: { kind: "Name", value: "name" } },
          { kind: "Field", name: { kind: "Name", value: "documentType" } },
          { kind: "Field", name: { kind: "Name", value: "state" } },
          { kind: "Field", name: { kind: "Name", value: "revision" } },
          { kind: "Field", name: { kind: "Name", value: "created" } },
          { kind: "Field", name: { kind: "Name", value: "lastModified" } },
          { kind: "Field", name: { kind: "Name", value: "parentId" } },
        ],
      },
    },
  ],
} as unknown as DocumentNode;
export const MutateDocumentDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "mutation",
      name: { kind: "Name", value: "MutateDocument" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: {
            kind: "Variable",
            name: { kind: "Name", value: "documentIdentifier" },
          },
          type: {
            kind: "NonNullType",
            type: {
              kind: "NamedType",
              name: { kind: "Name", value: "String" },
            },
          },
        },
        {
          kind: "VariableDefinition",
          variable: {
            kind: "Variable",
            name: { kind: "Name", value: "actions" },
          },
          type: {
            kind: "NonNullType",
            type: {
              kind: "ListType",
              type: {
                kind: "NonNullType",
                type: {
                  kind: "NamedType",
                  name: { kind: "Name", value: "JSONObject" },
                },
              },
            },
          },
        },
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "view" } },
          type: {
            kind: "NamedType",
            name: { kind: "Name", value: "ViewFilterInput" },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "mutateDocument" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "documentIdentifier" },
                value: {
                  kind: "Variable",
                  name: { kind: "Name", value: "documentIdentifier" },
                },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "actions" },
                value: {
                  kind: "Variable",
                  name: { kind: "Name", value: "actions" },
                },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "view" },
                value: {
                  kind: "Variable",
                  name: { kind: "Name", value: "view" },
                },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                {
                  kind: "FragmentSpread",
                  name: { kind: "Name", value: "PHDocumentFields" },
                },
              ],
            },
          },
        ],
      },
    },
    {
      kind: "FragmentDefinition",
      name: { kind: "Name", value: "PHDocumentFields" },
      typeCondition: {
        kind: "NamedType",
        name: { kind: "Name", value: "PHDocument" },
      },
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          { kind: "Field", name: { kind: "Name", value: "id" } },
          { kind: "Field", name: { kind: "Name", value: "slug" } },
          { kind: "Field", name: { kind: "Name", value: "name" } },
          { kind: "Field", name: { kind: "Name", value: "documentType" } },
          { kind: "Field", name: { kind: "Name", value: "state" } },
          { kind: "Field", name: { kind: "Name", value: "revision" } },
          { kind: "Field", name: { kind: "Name", value: "created" } },
          { kind: "Field", name: { kind: "Name", value: "lastModified" } },
          { kind: "Field", name: { kind: "Name", value: "parentId" } },
        ],
      },
    },
  ],
} as unknown as DocumentNode;
export const MutateDocumentAsyncDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "mutation",
      name: { kind: "Name", value: "MutateDocumentAsync" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: {
            kind: "Variable",
            name: { kind: "Name", value: "documentIdentifier" },
          },
          type: {
            kind: "NonNullType",
            type: {
              kind: "NamedType",
              name: { kind: "Name", value: "String" },
            },
          },
        },
        {
          kind: "VariableDefinition",
          variable: {
            kind: "Variable",
            name: { kind: "Name", value: "actions" },
          },
          type: {
            kind: "NonNullType",
            type: {
              kind: "ListType",
              type: {
                kind: "NonNullType",
                type: {
                  kind: "NamedType",
                  name: { kind: "Name", value: "JSONObject" },
                },
              },
            },
          },
        },
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "view" } },
          type: {
            kind: "NamedType",
            name: { kind: "Name", value: "ViewFilterInput" },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "mutateDocumentAsync" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "documentIdentifier" },
                value: {
                  kind: "Variable",
                  name: { kind: "Name", value: "documentIdentifier" },
                },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "actions" },
                value: {
                  kind: "Variable",
                  name: { kind: "Name", value: "actions" },
                },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "view" },
                value: {
                  kind: "Variable",
                  name: { kind: "Name", value: "view" },
                },
              },
            ],
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode;
export const RenameDocumentDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "mutation",
      name: { kind: "Name", value: "RenameDocument" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: {
            kind: "Variable",
            name: { kind: "Name", value: "documentIdentifier" },
          },
          type: {
            kind: "NonNullType",
            type: {
              kind: "NamedType",
              name: { kind: "Name", value: "String" },
            },
          },
        },
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "name" } },
          type: {
            kind: "NonNullType",
            type: {
              kind: "NamedType",
              name: { kind: "Name", value: "String" },
            },
          },
        },
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "view" } },
          type: {
            kind: "NamedType",
            name: { kind: "Name", value: "ViewFilterInput" },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "renameDocument" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "documentIdentifier" },
                value: {
                  kind: "Variable",
                  name: { kind: "Name", value: "documentIdentifier" },
                },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "name" },
                value: {
                  kind: "Variable",
                  name: { kind: "Name", value: "name" },
                },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "view" },
                value: {
                  kind: "Variable",
                  name: { kind: "Name", value: "view" },
                },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                {
                  kind: "FragmentSpread",
                  name: { kind: "Name", value: "PHDocumentFields" },
                },
              ],
            },
          },
        ],
      },
    },
    {
      kind: "FragmentDefinition",
      name: { kind: "Name", value: "PHDocumentFields" },
      typeCondition: {
        kind: "NamedType",
        name: { kind: "Name", value: "PHDocument" },
      },
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          { kind: "Field", name: { kind: "Name", value: "id" } },
          { kind: "Field", name: { kind: "Name", value: "slug" } },
          { kind: "Field", name: { kind: "Name", value: "name" } },
          { kind: "Field", name: { kind: "Name", value: "documentType" } },
          { kind: "Field", name: { kind: "Name", value: "state" } },
          { kind: "Field", name: { kind: "Name", value: "revision" } },
          { kind: "Field", name: { kind: "Name", value: "created" } },
          { kind: "Field", name: { kind: "Name", value: "lastModified" } },
          { kind: "Field", name: { kind: "Name", value: "parentId" } },
        ],
      },
    },
  ],
} as unknown as DocumentNode;
export const AddChildrenDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "mutation",
      name: { kind: "Name", value: "AddChildren" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: {
            kind: "Variable",
            name: { kind: "Name", value: "parentIdentifier" },
          },
          type: {
            kind: "NonNullType",
            type: {
              kind: "NamedType",
              name: { kind: "Name", value: "String" },
            },
          },
        },
        {
          kind: "VariableDefinition",
          variable: {
            kind: "Variable",
            name: { kind: "Name", value: "documentIdentifiers" },
          },
          type: {
            kind: "NonNullType",
            type: {
              kind: "ListType",
              type: {
                kind: "NonNullType",
                type: {
                  kind: "NamedType",
                  name: { kind: "Name", value: "String" },
                },
              },
            },
          },
        },
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "view" } },
          type: {
            kind: "NamedType",
            name: { kind: "Name", value: "ViewFilterInput" },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "addChildren" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "parentIdentifier" },
                value: {
                  kind: "Variable",
                  name: { kind: "Name", value: "parentIdentifier" },
                },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "documentIdentifiers" },
                value: {
                  kind: "Variable",
                  name: { kind: "Name", value: "documentIdentifiers" },
                },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "view" },
                value: {
                  kind: "Variable",
                  name: { kind: "Name", value: "view" },
                },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                {
                  kind: "FragmentSpread",
                  name: { kind: "Name", value: "PHDocumentFields" },
                },
              ],
            },
          },
        ],
      },
    },
    {
      kind: "FragmentDefinition",
      name: { kind: "Name", value: "PHDocumentFields" },
      typeCondition: {
        kind: "NamedType",
        name: { kind: "Name", value: "PHDocument" },
      },
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          { kind: "Field", name: { kind: "Name", value: "id" } },
          { kind: "Field", name: { kind: "Name", value: "slug" } },
          { kind: "Field", name: { kind: "Name", value: "name" } },
          { kind: "Field", name: { kind: "Name", value: "documentType" } },
          { kind: "Field", name: { kind: "Name", value: "state" } },
          { kind: "Field", name: { kind: "Name", value: "revision" } },
          { kind: "Field", name: { kind: "Name", value: "created" } },
          { kind: "Field", name: { kind: "Name", value: "lastModified" } },
          { kind: "Field", name: { kind: "Name", value: "parentId" } },
        ],
      },
    },
  ],
} as unknown as DocumentNode;
export const RemoveChildrenDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "mutation",
      name: { kind: "Name", value: "RemoveChildren" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: {
            kind: "Variable",
            name: { kind: "Name", value: "parentIdentifier" },
          },
          type: {
            kind: "NonNullType",
            type: {
              kind: "NamedType",
              name: { kind: "Name", value: "String" },
            },
          },
        },
        {
          kind: "VariableDefinition",
          variable: {
            kind: "Variable",
            name: { kind: "Name", value: "documentIdentifiers" },
          },
          type: {
            kind: "NonNullType",
            type: {
              kind: "ListType",
              type: {
                kind: "NonNullType",
                type: {
                  kind: "NamedType",
                  name: { kind: "Name", value: "String" },
                },
              },
            },
          },
        },
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "view" } },
          type: {
            kind: "NamedType",
            name: { kind: "Name", value: "ViewFilterInput" },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "removeChildren" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "parentIdentifier" },
                value: {
                  kind: "Variable",
                  name: { kind: "Name", value: "parentIdentifier" },
                },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "documentIdentifiers" },
                value: {
                  kind: "Variable",
                  name: { kind: "Name", value: "documentIdentifiers" },
                },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "view" },
                value: {
                  kind: "Variable",
                  name: { kind: "Name", value: "view" },
                },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                {
                  kind: "FragmentSpread",
                  name: { kind: "Name", value: "PHDocumentFields" },
                },
              ],
            },
          },
        ],
      },
    },
    {
      kind: "FragmentDefinition",
      name: { kind: "Name", value: "PHDocumentFields" },
      typeCondition: {
        kind: "NamedType",
        name: { kind: "Name", value: "PHDocument" },
      },
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          { kind: "Field", name: { kind: "Name", value: "id" } },
          { kind: "Field", name: { kind: "Name", value: "slug" } },
          { kind: "Field", name: { kind: "Name", value: "name" } },
          { kind: "Field", name: { kind: "Name", value: "documentType" } },
          { kind: "Field", name: { kind: "Name", value: "state" } },
          { kind: "Field", name: { kind: "Name", value: "revision" } },
          { kind: "Field", name: { kind: "Name", value: "created" } },
          { kind: "Field", name: { kind: "Name", value: "lastModified" } },
          { kind: "Field", name: { kind: "Name", value: "parentId" } },
        ],
      },
    },
  ],
} as unknown as DocumentNode;
export const MoveChildrenDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "mutation",
      name: { kind: "Name", value: "MoveChildren" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: {
            kind: "Variable",
            name: { kind: "Name", value: "sourceParentIdentifier" },
          },
          type: {
            kind: "NonNullType",
            type: {
              kind: "NamedType",
              name: { kind: "Name", value: "String" },
            },
          },
        },
        {
          kind: "VariableDefinition",
          variable: {
            kind: "Variable",
            name: { kind: "Name", value: "targetParentIdentifier" },
          },
          type: {
            kind: "NonNullType",
            type: {
              kind: "NamedType",
              name: { kind: "Name", value: "String" },
            },
          },
        },
        {
          kind: "VariableDefinition",
          variable: {
            kind: "Variable",
            name: { kind: "Name", value: "documentIdentifiers" },
          },
          type: {
            kind: "NonNullType",
            type: {
              kind: "ListType",
              type: {
                kind: "NonNullType",
                type: {
                  kind: "NamedType",
                  name: { kind: "Name", value: "String" },
                },
              },
            },
          },
        },
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "view" } },
          type: {
            kind: "NamedType",
            name: { kind: "Name", value: "ViewFilterInput" },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "moveChildren" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "sourceParentIdentifier" },
                value: {
                  kind: "Variable",
                  name: { kind: "Name", value: "sourceParentIdentifier" },
                },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "targetParentIdentifier" },
                value: {
                  kind: "Variable",
                  name: { kind: "Name", value: "targetParentIdentifier" },
                },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "documentIdentifiers" },
                value: {
                  kind: "Variable",
                  name: { kind: "Name", value: "documentIdentifiers" },
                },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "view" },
                value: {
                  kind: "Variable",
                  name: { kind: "Name", value: "view" },
                },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                {
                  kind: "Field",
                  name: { kind: "Name", value: "source" },
                  selectionSet: {
                    kind: "SelectionSet",
                    selections: [
                      {
                        kind: "FragmentSpread",
                        name: { kind: "Name", value: "PHDocumentFields" },
                      },
                    ],
                  },
                },
                {
                  kind: "Field",
                  name: { kind: "Name", value: "target" },
                  selectionSet: {
                    kind: "SelectionSet",
                    selections: [
                      {
                        kind: "FragmentSpread",
                        name: { kind: "Name", value: "PHDocumentFields" },
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
    {
      kind: "FragmentDefinition",
      name: { kind: "Name", value: "PHDocumentFields" },
      typeCondition: {
        kind: "NamedType",
        name: { kind: "Name", value: "PHDocument" },
      },
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          { kind: "Field", name: { kind: "Name", value: "id" } },
          { kind: "Field", name: { kind: "Name", value: "slug" } },
          { kind: "Field", name: { kind: "Name", value: "name" } },
          { kind: "Field", name: { kind: "Name", value: "documentType" } },
          { kind: "Field", name: { kind: "Name", value: "state" } },
          { kind: "Field", name: { kind: "Name", value: "revision" } },
          { kind: "Field", name: { kind: "Name", value: "created" } },
          { kind: "Field", name: { kind: "Name", value: "lastModified" } },
          { kind: "Field", name: { kind: "Name", value: "parentId" } },
        ],
      },
    },
  ],
} as unknown as DocumentNode;
export const DeleteDocumentDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "mutation",
      name: { kind: "Name", value: "DeleteDocument" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: {
            kind: "Variable",
            name: { kind: "Name", value: "identifier" },
          },
          type: {
            kind: "NonNullType",
            type: {
              kind: "NamedType",
              name: { kind: "Name", value: "String" },
            },
          },
        },
        {
          kind: "VariableDefinition",
          variable: {
            kind: "Variable",
            name: { kind: "Name", value: "propagate" },
          },
          type: {
            kind: "NamedType",
            name: { kind: "Name", value: "PropagationMode" },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "deleteDocument" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "identifier" },
                value: {
                  kind: "Variable",
                  name: { kind: "Name", value: "identifier" },
                },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "propagate" },
                value: {
                  kind: "Variable",
                  name: { kind: "Name", value: "propagate" },
                },
              },
            ],
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode;
export const DeleteDocumentsDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "mutation",
      name: { kind: "Name", value: "DeleteDocuments" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: {
            kind: "Variable",
            name: { kind: "Name", value: "identifiers" },
          },
          type: {
            kind: "NonNullType",
            type: {
              kind: "ListType",
              type: {
                kind: "NonNullType",
                type: {
                  kind: "NamedType",
                  name: { kind: "Name", value: "String" },
                },
              },
            },
          },
        },
        {
          kind: "VariableDefinition",
          variable: {
            kind: "Variable",
            name: { kind: "Name", value: "propagate" },
          },
          type: {
            kind: "NamedType",
            name: { kind: "Name", value: "PropagationMode" },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "deleteDocuments" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "identifiers" },
                value: {
                  kind: "Variable",
                  name: { kind: "Name", value: "identifiers" },
                },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "propagate" },
                value: {
                  kind: "Variable",
                  name: { kind: "Name", value: "propagate" },
                },
              },
            ],
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode;
export const DocumentChangesDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "subscription",
      name: { kind: "Name", value: "DocumentChanges" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: {
            kind: "Variable",
            name: { kind: "Name", value: "search" },
          },
          type: {
            kind: "NonNullType",
            type: {
              kind: "NamedType",
              name: { kind: "Name", value: "SearchFilterInput" },
            },
          },
        },
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "view" } },
          type: {
            kind: "NamedType",
            name: { kind: "Name", value: "ViewFilterInput" },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "documentChanges" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "search" },
                value: {
                  kind: "Variable",
                  name: { kind: "Name", value: "search" },
                },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "view" },
                value: {
                  kind: "Variable",
                  name: { kind: "Name", value: "view" },
                },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "type" } },
                {
                  kind: "Field",
                  name: { kind: "Name", value: "documents" },
                  selectionSet: {
                    kind: "SelectionSet",
                    selections: [
                      {
                        kind: "FragmentSpread",
                        name: { kind: "Name", value: "PHDocumentFields" },
                      },
                    ],
                  },
                },
                {
                  kind: "Field",
                  name: { kind: "Name", value: "context" },
                  selectionSet: {
                    kind: "SelectionSet",
                    selections: [
                      {
                        kind: "Field",
                        name: { kind: "Name", value: "parentId" },
                      },
                      {
                        kind: "Field",
                        name: { kind: "Name", value: "childId" },
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
    {
      kind: "FragmentDefinition",
      name: { kind: "Name", value: "PHDocumentFields" },
      typeCondition: {
        kind: "NamedType",
        name: { kind: "Name", value: "PHDocument" },
      },
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          { kind: "Field", name: { kind: "Name", value: "id" } },
          { kind: "Field", name: { kind: "Name", value: "slug" } },
          { kind: "Field", name: { kind: "Name", value: "name" } },
          { kind: "Field", name: { kind: "Name", value: "documentType" } },
          { kind: "Field", name: { kind: "Name", value: "state" } },
          { kind: "Field", name: { kind: "Name", value: "revision" } },
          { kind: "Field", name: { kind: "Name", value: "created" } },
          { kind: "Field", name: { kind: "Name", value: "lastModified" } },
          { kind: "Field", name: { kind: "Name", value: "parentId" } },
        ],
      },
    },
  ],
} as unknown as DocumentNode;
export const JobChangesDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "subscription",
      name: { kind: "Name", value: "JobChanges" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: {
            kind: "Variable",
            name: { kind: "Name", value: "jobId" },
          },
          type: {
            kind: "NonNullType",
            type: {
              kind: "NamedType",
              name: { kind: "Name", value: "String" },
            },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "jobChanges" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "jobId" },
                value: {
                  kind: "Variable",
                  name: { kind: "Name", value: "jobId" },
                },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "jobId" } },
                { kind: "Field", name: { kind: "Name", value: "status" } },
                { kind: "Field", name: { kind: "Name", value: "result" } },
                { kind: "Field", name: { kind: "Name", value: "error" } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode;
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
