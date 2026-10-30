import type {
  JobInfo,
  PagedResults,
  ReactorInfo,
  ViewFilter,
} from "@powerhousedao/reactor";
import type {
  BackendHealth,
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
import {
  isDeadlineError,
  switchboardFetch,
  type GraphQLFetch,
} from "./transport.js";

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
  /** Bound on one request, headers through body. Default 30_000. */
  readonly requestTimeoutMs?: number;
  /** Unset fields take {@link DEFAULT_BREAKER}; `false` never opens. */
  readonly breaker?: SwitchboardBreaker;
  /** The transport under the deadline and the breaker; {@link switchboardFetch} by default. */
  readonly fetch?: GraphQLFetch;
};

export const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
export const DEFAULT_BREAKER = Object.freeze({ failures: 3, openMs: 30_000 });

/** After `failures` failed requests in a row, send nothing for `openMs`. */
export type SwitchboardBreaker =
  | false
  | { readonly failures?: number; readonly openMs?: number };

function breakerSettings(breaker: SwitchboardBreaker | undefined): {
  failures: number;
  openMs: number;
} {
  if (breaker === false) return { failures: Infinity, openMs: 0 };
  return { ...DEFAULT_BREAKER, ...breaker };
}

export type SwitchboardBackend = {
  /** reach `{hosting: "remote", inspection}`; `refusesMisroutes: false`. */
  readonly config: RoutableBackendConfig;
  /** Reopens the realtime socket on the new credentials. */
  notifyCredentialsChanged(): void;
  /** Closes the realtime socket. */
  dispose(): void;
};

const FACTS_QUERY = /* GraphQL */ `
  query SwitchboardFacts {
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
      documentModels {
        documentType
      }
    }
    queries: __type(name: "Query") {
      fields {
        name
      }
    }
    inspectionFields: __type(name: "ReactorInspection") {
      fields {
        name
      }
    }
  }
`;

const MODEL_LOADING_QUERY = /* GraphQL */ `
  query SwitchboardModelLoading {
    inspection {
      loadsModelsOnDemand
    }
  }
`;

type TypeFields = { fields: readonly { name: string }[] | null } | null;

type FactsAnswer = {
  inspection: {
    info: Omit<ReactorInfo, "access"> & {
      access: ReactorInfo["access"] | null;
    };
    documentModels: readonly { documentType: string }[];
  };
  queries: TypeFields;
  inspectionFields: TypeFields;
};

type SwitchboardFacts = {
  readonly info: ReactorInfo;
  /** Undefined: the Switchboard loads models on demand, or does not say. */
  readonly documentTypes: readonly string[] | undefined;
};

/** Queries this backend sends that a Switchboard serves only from some version. */
const REQUIRED_QUERIES = ["documentServed", "createDefaults", "inspection"];

/** The Switchboard's circuit is open: nothing was sent. */
export class SwitchboardUnreachableError extends Error {
  override readonly name = "SwitchboardUnreachableError";

  constructor(
    readonly backend: string,
    readonly retryAt: number,
  ) {
    super(
      `Switchboard backend ${JSON.stringify(backend)} is unreachable; nothing is sent until ${new Date(retryAt).toISOString()}`,
    );
  }
}

/**
 * Opens after `failures` transport failures in a row (a network error, a
 * deadline or a 5xx) and sends nothing for `openMs`. Any other answer, a
 * GraphQL error included, closes it. The first request after `openMs` goes
 * through; one more failure opens it again.
 */
class Breaker {
  private consecutive = 0;
  private openUntil: number | undefined;

  constructor(
    private readonly backend: string,
    private readonly settings: { failures: number; openMs: number },
  ) {}

  health(): BackendHealth {
    return this.isOpen() ? "down" : "up";
  }

  wrap(inner: GraphQLFetch): GraphQLFetch {
    return async (input, init) => {
      const openUntil = this.openUntil;
      if (openUntil !== undefined && Date.now() < openUntil) {
        throw new SwitchboardUnreachableError(this.backend, openUntil);
      }
      let response: Response;
      try {
        response = await inner(input, init);
      } catch (error) {
        if (!abortedByCaller(init?.signal)) {
          this.fail();
        }
        throw error;
      }
      if (response.status >= 500) {
        this.fail();
      } else {
        this.consecutive = 0;
        this.openUntil = undefined;
      }
      return response;
    };
  }

  private isOpen(): boolean {
    return this.openUntil !== undefined && Date.now() < this.openUntil;
  }

  private fail(): void {
    this.consecutive += 1;
    if (this.consecutive >= this.settings.failures) {
      this.openUntil = Date.now() + this.settings.openMs;
    }
  }
}

function abortedByCaller(signal: AbortSignal | null | undefined): boolean {
  return Boolean(signal?.aborted) && !isDeadlineError(signal?.reason);
}

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
  const breaker = new Breaker(
    descriptor.name,
    breakerSettings(descriptor.breaker),
  );
  const signer = descriptor.signer;
  const gql = new GraphQLReactorClient({
    url: descriptor.url,
    tokenProvider: descriptor.tokenProvider,
    signer: typeof signer === "function" ? signer : () => signer,
    documentModels: descriptor.documentModels,
    realtime: descriptor.realtime,
    driveIdFor: drives.driveIdFor,
    requestTimeoutMs: descriptor.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
    fetch: breaker.wrap(descriptor.fetch ?? switchboardFetch),
  });
  const backend: IRoutableBackend = {
    supports: { find: findIsServableOverGraphQL, pointInTimeViews: false },
    health: () => breaker.health(),
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
  // The router reads the facts and the types together; they share one query.
  let reading: Promise<SwitchboardFacts> | undefined;
  const read = () =>
    (reading ??= readFacts(gql, descriptor.url).finally(() => {
      reading = undefined;
    }));
  return {
    config: {
      name: descriptor.name,
      backend,
      facts: async () => (await read()).info,
      documentTypes: async () => (await read()).documentTypes,
      reach: { hosting: "remote", inspection: descriptor.inspection ?? "rpc" },
      refusesMisroutes: false,
    },
    notifyCredentialsChanged: () => gql.notifyCredentialsChanged(),
    dispose: () => gql.dispose(),
  };
}

function fieldNames(type: TypeFields): Set<string> {
  return new Set(type?.fields?.map((field) => field.name));
}

async function readFacts(
  gql: GraphQLReactorClient,
  url: string,
): Promise<SwitchboardFacts> {
  const answer = await gql.request<FactsAnswer>(FACTS_QUERY);
  const served = fieldNames(answer.queries);
  const missing = REQUIRED_QUERIES.filter((query) => !served.has(query));
  if (missing.length > 0) {
    throw new Error(
      `The Switchboard at ${url} does not serve ${missing.join(", ")}; it is older than this client`,
    );
  }
  const { info, documentModels } = answer.inspection;
  // A Switchboard too old to say how it loads models gets no constraint.
  const closed =
    fieldNames(answer.inspectionFields).has("loadsModelsOnDemand") &&
    !(
      await gql.request<{ inspection: { loadsModelsOnDemand: boolean } }>(
        MODEL_LOADING_QUERY,
      )
    ).inspection.loadsModelsOnDemand;
  return {
    info: { ...info, access: info.access ?? NO_ACCESS },
    documentTypes: closed
      ? documentModels.map((model) => model.documentType)
      : undefined,
  };
}
