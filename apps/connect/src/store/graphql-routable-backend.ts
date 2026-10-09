import {
  JOB_NOT_FOUND_ERROR_NAME,
  JobStatus,
  type PagedResults,
  type ReactorInfo,
} from "@powerhousedao/reactor";
import {
  DRIVE_DOCUMENT_TYPES,
  findIsServableOverGraphQL,
  GraphQLReactorClient,
  type DriveIdCall,
  type GraphQLReactorClientOptions,
} from "@powerhousedao/reactor-browser";
import type { IRoutableBackend } from "@powerhousedao/reactor-router";
import type { PHDocument } from "@powerhousedao/shared/document-model";

const REMOTE_INFO_QUERY = /* GraphQL */ `
  query RemoteReactorInfo {
    inspection {
      info {
        storage {
          engine
          persistence
          durable
          selfHeal
        }
        workflows
        syncChannels
      }
    }
  }
`;

type RemoteReactorInfo = {
  inspection: { info: Omit<ReactorInfo, "access"> };
};

/** Ids and slugs of documents this backend answered as drives, by drive id. */
class KnownDrives {
  private readonly ids = new Map<string, string>();

  learn<T extends PHDocument>(document: T): T {
    const { id, slug, documentType } = document.header;
    if ((DRIVE_DOCUMENT_TYPES as readonly string[]).includes(documentType)) {
      this.ids.set(id, id);
      if (slug) {
        this.ids.set(slug, id);
      }
    }
    return document;
  }

  learnPage<T extends PHDocument>(page: PagedResults<T>): PagedResults<T> {
    for (const document of page.results) {
      this.learn(document);
    }
    return page;
  }

  driveOf(identifier: string | undefined): string | undefined {
    return identifier === undefined ? undefined : this.ids.get(identifier);
  }

  /** Names a drive only when this backend proved it is one. */
  driveIdFor = (call: DriveIdCall): string | undefined => {
    switch (call.method) {
      case "create":
      case "find":
        return this.driveOf(call.parentId);
      case "execute":
      case "deleteDocument":
        return this.driveOf(call.documentId);
      case "executeBatch":
        for (const job of call.jobs ?? []) {
          const drive = this.driveOf(job.documentId);
          if (drive !== undefined) {
            return drive;
          }
        }
        return undefined;
    }
  };
}

export type GraphQLRoutableBackendOptions = Omit<
  GraphQLReactorClientOptions,
  "driveIdFor"
>;

export type GraphQLRoutableBackend = {
  readonly backend: IRoutableBackend;
  /** The Switchboard's own facts, from its inspection subgraph. */
  info(): Promise<ReactorInfo>;
};

/** A Switchboard as a router backend; members GraphQL cannot serve are absent. */
export function createGraphQLRoutableBackend(
  options: GraphQLRoutableBackendOptions,
): GraphQLRoutableBackend {
  const drives = new KnownDrives();
  const gql = new GraphQLReactorClient({
    ...options,
    driveIdFor: drives.driveIdFor,
  });
  const backend: IRoutableBackend = {
    supports: { find: findIsServableOverGraphQL, pointInTimeViews: false },
    get: async (identifier, view, signal) =>
      drives.learn(await gql.get(identifier, view, signal)),
    getOperations: (identifier, view, filter, paging, signal) =>
      gql.getOperations(identifier, view, filter, paging, signal),
    find: async (search, view, paging, signal) =>
      drives.learnPage(await gql.find(search, view, paging, signal)),
    isServed: (identifier, view, signal) =>
      gql.isServed(identifier, view, signal),
    getOutgoingRelationships: (source, type, view, paging, signal) =>
      gql.getOutgoingRelationships(source, type, view, paging, signal),
    getIncomingRelationships: (target, type, view, paging, signal) =>
      gql.getIncomingRelationships(target, type, view, paging, signal),
    getOutgoingRelationshipEdges: (source, type, view, paging, signal) =>
      gql.getOutgoingRelationshipEdges(source, type, view, paging, signal),
    getIncomingRelationshipEdges: (target, type, view, paging, signal) =>
      gql.getIncomingRelationshipEdges(target, type, view, paging, signal),
    subscribe: (search, callback, view) =>
      gql.subscribe(search, callback, view),
    getCreateSignaturePolicy: () => gql.getCreateSignaturePolicy(),
    getCreateProtocolVersions: (parent, signal) =>
      gql.getCreateProtocolVersions(parent, signal),
    create: async (document, parent, signal) =>
      drives.learn(await gql.create(document, parent, signal)),
    execute: async (identifier, branch, actions, signal) =>
      drives.learn(await gql.execute(identifier, branch, actions, signal)),
    executeBatch: (request, signal) => gql.executeBatch(request, signal),
    deleteDocument: (identifier, propagate, signal) =>
      gql.deleteDocument(identifier, propagate, signal),
    setPreferredEditor: (identifier, editor, branch, signal) =>
      gql.setPreferredEditor(identifier, editor, branch, signal),
    getJob: async (jobId, signal) => {
      const job = await gql.getJob(jobId, signal);
      return job?.status === JobStatus.FAILED &&
        job.error?.name === JOB_NOT_FOUND_ERROR_NAME
        ? undefined
        : job;
    },
    waitForJob: (job, signal) => gql.waitForJob(job, signal),
  };
  return {
    backend,
    info: async () => {
      const result = await gql.request<RemoteReactorInfo>(REMOTE_INFO_QUERY);
      return {
        ...result.inspection.info,
        access: { admin: false, sql: false },
      };
    },
  };
}
