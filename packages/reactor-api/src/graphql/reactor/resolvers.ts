import type {
  IReactorClient,
  JobInfo,
  PagedResults,
  PagingOptions,
  SearchFilter,
  ViewFilter,
} from "@powerhousedao/reactor";
import type { DocumentModelModule, PHDocument } from "document-model";
import { GraphQLError } from "graphql";
import {
  fromInputMaybe,
  toDocumentModelResultPage,
  toGqlJobInfo,
  toGqlPhDocument,
  toMutableArray,
  toPhDocumentResultPage,
} from "./adapters.js";
import type {
  DocumentModelResultPage,
  JobInfo as GqlJobInfo,
  PhDocumentResultPage,
} from "./gen/graphql.js";

export async function documentModels(
  reactorClient: IReactorClient,
  args: {
    namespace?: string | null;
    paging?: {
      cursor?: string | null;
      limit?: number | null;
    } | null;
  },
): Promise<DocumentModelResultPage> {
  const namespace = fromInputMaybe(args.namespace);

  let paging: PagingOptions | undefined;
  if (args.paging) {
    const cursor = fromInputMaybe(args.paging.cursor);
    const limit = fromInputMaybe(args.paging.limit);
    if (cursor || limit) {
      paging = {
        cursor: cursor || "",
        limit: limit || 10,
      };
    }
  }

  let result: PagedResults<DocumentModelModule>;
  try {
    result = await reactorClient.getDocumentModels(namespace, paging);
  } catch (error) {
    throw new GraphQLError(
      `Failed to fetch document models: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }

  try {
    return toDocumentModelResultPage(result);
  } catch (error) {
    throw new GraphQLError(
      `Failed to convert document models to GraphQL: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

export async function document(
  reactorClient: IReactorClient,
  args: {
    identifier: string;
    view?: {
      branch?: string | null;
      scopes?: readonly string[] | null;
    } | null;
  },
): Promise<{
  document: ReturnType<typeof toGqlPhDocument>;
  childIds: string[];
}> {
  let view: ViewFilter | undefined;
  if (args.view) {
    view = {
      branch: fromInputMaybe(args.view.branch),
      scopes: toMutableArray(fromInputMaybe(args.view.scopes)),
    };
  }

  let result: {
    document: PHDocument;
    childIds: string[];
  };
  try {
    result = await reactorClient.get(args.identifier, view);
  } catch (error) {
    throw new GraphQLError(
      `Failed to fetch document: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }

  try {
    return {
      document: toGqlPhDocument(result.document),
      childIds: result.childIds,
    };
  } catch (error) {
    throw new GraphQLError(
      `Failed to convert document to GraphQL: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

export async function documentChildren(
  reactorClient: IReactorClient,
  args: {
    parentIdentifier: string;
    view?: {
      branch?: string | null;
      scopes?: readonly string[] | null;
    } | null;
    paging?: {
      cursor?: string | null;
      limit?: number | null;
    } | null;
  },
): Promise<PhDocumentResultPage> {
  let view: ViewFilter | undefined;
  if (args.view) {
    view = {
      branch: fromInputMaybe(args.view.branch),
      scopes: toMutableArray(fromInputMaybe(args.view.scopes)),
    };
  }

  let paging: PagingOptions | undefined;
  if (args.paging) {
    const cursor = fromInputMaybe(args.paging.cursor);
    const limit = fromInputMaybe(args.paging.limit);
    if (cursor || limit) {
      paging = {
        cursor: cursor || "",
        limit: limit || 10,
      };
    }
  }

  let result: PagedResults<PHDocument>;
  try {
    result = await reactorClient.getChildren(
      args.parentIdentifier,
      view,
      paging,
    );
  } catch (error) {
    throw new GraphQLError(
      `Failed to fetch document children: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }

  try {
    return toPhDocumentResultPage(result);
  } catch (error) {
    throw new GraphQLError(
      `Failed to convert document children to GraphQL: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

export async function documentParents(
  reactorClient: IReactorClient,
  args: {
    childIdentifier: string;
    view?: {
      branch?: string | null;
      scopes?: readonly string[] | null;
    } | null;
    paging?: {
      cursor?: string | null;
      limit?: number | null;
    } | null;
  },
): Promise<PhDocumentResultPage> {
  let view: ViewFilter | undefined;
  if (args.view) {
    view = {
      branch: fromInputMaybe(args.view.branch),
      scopes: toMutableArray(fromInputMaybe(args.view.scopes)),
    };
  }

  let paging: PagingOptions | undefined;
  if (args.paging) {
    const cursor = fromInputMaybe(args.paging.cursor);
    const limit = fromInputMaybe(args.paging.limit);
    if (cursor || limit) {
      paging = {
        cursor: cursor || "",
        limit: limit || 10,
      };
    }
  }

  let result: PagedResults<PHDocument>;
  try {
    result = await reactorClient.getParents(args.childIdentifier, view, paging);
  } catch (error) {
    throw new GraphQLError(
      `Failed to fetch document parents: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }

  try {
    return toPhDocumentResultPage(result);
  } catch (error) {
    throw new GraphQLError(
      `Failed to convert document parents to GraphQL: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

export async function findDocuments(
  reactorClient: IReactorClient,
  args: {
    search: {
      type?: string | null;
      parentId?: string | null;
    };
    view?: {
      branch?: string | null;
      scopes?: readonly string[] | null;
    } | null;
    paging?: {
      cursor?: string | null;
      limit?: number | null;
    } | null;
  },
): Promise<PhDocumentResultPage> {
  let view: ViewFilter | undefined;
  if (args.view) {
    view = {
      branch: fromInputMaybe(args.view.branch),
      scopes: toMutableArray(fromInputMaybe(args.view.scopes)),
    };
  }

  let paging: PagingOptions | undefined;
  if (args.paging) {
    const cursor = fromInputMaybe(args.paging.cursor);
    const limit = fromInputMaybe(args.paging.limit);
    if (cursor || limit) {
      paging = {
        cursor: cursor || "",
        limit: limit || 10,
      };
    }
  }

  const search: SearchFilter = {
    type: fromInputMaybe(args.search.type),
    parentId: fromInputMaybe(args.search.parentId),
  };

  let result: PagedResults<PHDocument>;
  try {
    result = await reactorClient.find(search, view, paging);
  } catch (error) {
    throw new GraphQLError(
      `Failed to find documents: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }

  try {
    return toPhDocumentResultPage(result);
  } catch (error) {
    throw new GraphQLError(
      `Failed to convert documents to GraphQL: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

export async function jobStatus(
  reactorClient: IReactorClient,
  args: {
    jobId: string;
  },
): Promise<GqlJobInfo> {
  let result: JobInfo;
  try {
    result = await reactorClient.getJobStatus(args.jobId);
  } catch (error) {
    throw new GraphQLError(
      `Failed to fetch job status: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }

  try {
    return toGqlJobInfo(result);
  } catch (error) {
    throw new GraphQLError(
      `Failed to convert job status to GraphQL: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}
