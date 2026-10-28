import type {
  JobInfo,
  PagedResults,
  ReactorInfo,
  ViewFilter,
} from "@powerhousedao/reactor";
import type {
  IRoutableBackend,
  ReactorReach,
  RoutableBackendConfig,
} from "@powerhousedao/reactor-router";
import type {
  Action,
  DocumentModelModule,
  ISigner,
  PHDocument,
} from "@powerhousedao/shared/document-model";
import { DRIVE_DOCUMENT_TYPES } from "../constants.js";
import { JOB_NOT_FOUND_ERROR_NAME } from "../reactor-interop.js";
import type { BearerTokenProvider } from "./auth.js";
import { GraphQLWrongBackendError } from "./errors.js";
import {
  findIsServableOverGraphQL,
  GraphQLReactorClient,
  type DriveIdCall,
} from "./graphql-reactor-client.js";

export type SwitchboardBackendDescriptor = {
  /** Router backend name; unique and stable for the router's life. */
  readonly name: string;
  /** `<origin>[/<prefix>]/graphql`. */
  readonly url: string;
  /** Resolves the bearer per request and for the realtime socket. */
  readonly tokenProvider: BearerTokenProvider;
  /** Read per push when a function; `undefined` pushes unsigned, never ambient. */
  readonly signer: ISigner | (() => ISigner | undefined) | undefined;
  /** Models for signing a batch, read per batch. */
  readonly documentModels: () => readonly DocumentModelModule<any>[];
  readonly realtime?: boolean;
  /** Default `"rpc"`. */
  readonly inspection?: ReactorReach["inspection"];
};

export type SwitchboardBackend = {
  /** reach `{hosting: "remote", inspection}`; `refusesMisroutes: false`. */
  readonly config: RoutableBackendConfig;
  /** Reopens the realtime socket on the new credentials. */
  notifyCredentialsChanged(): void;
  /** Closes the realtime socket. */
  dispose(): void;
};

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
        access {
          admin
          sql
        }
      }
    }
  }
`;

type RemoteReactorInfo = {
  inspection: {
    info: Omit<ReactorInfo, "access"> & {
      access: ReactorInfo["access"] | null;
    };
  };
};

const NO_ACCESS: ReactorInfo["access"] = Object.freeze({
  admin: false,
  sql: false,
});

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

  /** Drops a drive the Switchboard refused, by id and by slug. */
  forget(driveId: string): void {
    for (const [identifier, id] of this.ids) {
      if (id === driveId) {
        this.ids.delete(identifier);
      }
    }
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

  /** Runs a call that may carry `Drive-Id`; a 421 forgets the drive it named. */
  async refusable<T>(call: Promise<T>): Promise<T> {
    try {
      return await call;
    } catch (error) {
      if (GraphQLWrongBackendError.isError(error)) {
        this.forget(error.driveId);
      }
      throw error;
    }
  }
}

function isUnknownJob(job: JobInfo): boolean {
  const status: string = job.status;
  return status === "FAILED" && job.error?.name === JOB_NOT_FOUND_ERROR_NAME;
}

/** A Switchboard as a router backend; members GraphQL cannot serve are absent. */
export function createSwitchboardBackend(
  descriptor: SwitchboardBackendDescriptor,
): SwitchboardBackend {
  const drives = new KnownDrives();
  const signer = descriptor.signer;
  const gql = new GraphQLReactorClient({
    url: descriptor.url,
    tokenProvider: descriptor.tokenProvider,
    signer: typeof signer === "function" ? signer : () => signer,
    documentModels: descriptor.documentModels,
    realtime: descriptor.realtime,
    driveIdFor: drives.driveIdFor,
  });
  const backend: IRoutableBackend = {
    supports: { find: findIsServableOverGraphQL, pointInTimeViews: false },
    drives: gql.read.drives,
    get: async <TDocument extends PHDocument>(
      identifier: string,
      view?: ViewFilter,
      signal?: AbortSignal,
    ) => drives.learn(await gql.get<TDocument>(identifier, view, signal)),
    getMany: async <TDocument extends PHDocument>(
      ids: string[],
      view?: ViewFilter,
      signal?: AbortSignal,
    ) =>
      (await gql.getMany<TDocument>(ids, view, signal)).map((document) =>
        drives.learn(document),
      ),
    getOperations: (identifier, view, filter, paging, signal) =>
      gql.getOperations(identifier, view, filter, paging, signal),
    find: async (search, view, paging, signal) =>
      drives.learnPage(
        await drives.refusable(gql.find(search, view, paging, signal)),
      ),
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
    getCreateProtocolVersions: (options, signal) =>
      gql.getCreateProtocolVersions(options, signal),
    create: async <TDocument extends PHDocument = PHDocument>(
      document: PHDocument,
      parent?: string,
      signal?: AbortSignal,
    ) =>
      drives.learn(
        await drives.refusable(gql.create<TDocument>(document, parent, signal)),
      ),
    execute: async <TDocument extends PHDocument>(
      identifier: string,
      branch: string,
      actions: Action[],
      signal?: AbortSignal,
    ) =>
      drives.learn(
        await drives.refusable(
          gql.execute<TDocument>(identifier, branch, actions, signal),
        ),
      ),
    executeBatch: (request, signal) =>
      drives.refusable(gql.executeBatch(request, signal)),
    deleteDocument: (identifier, propagate, signal) =>
      drives.refusable(gql.deleteDocument(identifier, propagate, signal)),
    setPreferredEditor: (identifier, editor, branch, signal) =>
      gql.setPreferredEditor(identifier, editor, branch, signal),
    getJob: async (jobId, signal) => {
      const job = await gql.getJob(jobId, signal);
      return job && isUnknownJob(job) ? undefined : job;
    },
    waitForJob: (job, signal) => gql.waitForJob(job, signal),
  };
  const facts = async (): Promise<ReactorInfo> => {
    const { info } = (await gql.request<RemoteReactorInfo>(REMOTE_INFO_QUERY))
      .inspection;
    return { ...info, access: info.access ?? NO_ACCESS };
  };
  return {
    config: {
      name: descriptor.name,
      backend,
      facts,
      reach: { hosting: "remote", inspection: descriptor.inspection ?? "rpc" },
      refusesMisroutes: false,
    },
    notifyCredentialsChanged: () => gql.notifyCredentialsChanged(),
    dispose: () => gql.dispose(),
  };
}
