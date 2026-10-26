import type {
  BatchExecutionRequest,
  BatchWriteHandle,
  ConsistencyToken,
  IDriveWriteClient,
  IReactorClient,
  IReactorReadClient,
  IReactorWriteClient,
  JobInfo,
  WriteHandle,
  WriteReceipt,
} from "@powerhousedao/reactor";
import type { PHDocument } from "@powerhousedao/shared/document-model";
import {
  createRequestClients,
  readOnlyClients,
  type ClientOperation,
  type RequestClients,
} from "../../src/graphql/request-clients.js";

/** A token naming nothing, as a job carries before it has written. */
export const EMPTY_TOKEN: ConsistencyToken = {
  version: 1,
  createdAtUtcIso: "2026-01-01T00:00:00.000Z",
  coordinates: [],
};

/** A READ_READY job for `documentId`, as a settled write reports it. */
export function settledJob(
  documentId: string,
  overrides: Partial<JobInfo> = {},
): JobInfo {
  return {
    id: `job-${documentId}`,
    documentId,
    status: "READ_READY",
    createdAtUtcIso: "2026-01-01T00:00:00.000Z",
    completedAtUtcIso: "2026-01-01T00:00:00.000Z",
    consistencyToken: EMPTY_TOKEN,
    meta: { batchId: `job-${documentId}`, batchJobIds: [`job-${documentId}`] },
    ...overrides,
  } as JobInfo;
}

/**
 * A write handle whose stages have settled with `job`. `document()` is not
 * used by the GraphQL layer, which reads back through the read half.
 */
export function settledHandle(
  documentId: string,
  options: { branch?: string; job?: JobInfo; token?: ConsistencyToken } = {},
): WriteHandle {
  const branch = options.branch ?? "main";
  const job = options.job ?? settledJob(documentId);
  const receipt: WriteReceipt = {
    job,
    token: options.token ?? job.consistencyToken,
    documentId,
    branch,
  };
  return {
    jobId: job.id,
    documentId,
    branch,
    written: Promise.resolve(receipt),
    readable: Promise.resolve(receipt),
    document: () => Promise.reject(new Error("read back through read.get")),
  };
}

type FacadeMock = Partial<
  Record<keyof IReactorClient, (...args: never[]) => unknown>
> & { drives?: Partial<Record<string, (...args: never[]) => unknown>> };

type Method = (...args: unknown[]) => Promise<unknown>;

function call(
  mock: FacadeMock,
  name: string,
  args: unknown[],
): Promise<unknown> {
  const method = (mock as Record<string, unknown>)[name];
  if (typeof method !== "function") {
    return Promise.reject(new Error(`mock has no ${name}`));
  }
  return (method as Method)(...args);
}

const idOf = (document: unknown, fallback: string): string =>
  (document as PHDocument | undefined)?.header?.id ?? fallback;

/**
 * A write half over a facade-shaped mock whose writes return documents, as
 * the mocks written before the split do: each write calls the facade method of
 * the same name with the write's arguments and settles a handle on the
 * document it returned.
 */
export function facadeWriteHalf(mock: FacadeMock): IReactorWriteClient {
  const settledOn =
    (name: string, fallback: (args: unknown[]) => string, branchAt?: number) =>
    async (...args: unknown[]): Promise<WriteHandle> => {
      const result = await call(mock, name, args);
      const branch =
        branchAt === undefined ? undefined : (args[branchAt] as string);
      return settledHandle(idOf(result, fallback(args)), {
        branch: branch ?? "main",
      });
    };
  const first = (args: unknown[]) => args[0] as string;
  const drives = {
    addFile: async (
      driveId: string,
      document: PHDocument,
      parentFolder?: string,
    ) => {
      const added = await call(mock.drives as FacadeMock, "addFile", [
        driveId,
        document,
        parentFolder,
      ]);
      return settledHandle(idOf(added, document.header.id));
    },
    removeNode: async (driveId: string, nodeId: string) => {
      await call(mock.drives as FacadeMock, "removeNode", [driveId, nodeId]);
      return settledHandle(driveId);
    },
  } as unknown as IDriveWriteClient;
  return {
    drives,
    isDocumentIdTaken: (...args: unknown[]) =>
      call(mock, "isDocumentIdTaken", args),
    describe: async (identifier: string, branch = "main") => {
      const document = (await call(mock, "get", [identifier])) as PHDocument;
      return {
        documentId: document.header.id,
        documentType: document.header.documentType,
        slug: document.header.slug,
        branch,
        revision: { ...document.header.revision },
      };
    },
    evaluateActions: (...args: unknown[]) =>
      call(mock, "evaluateActions", args),
    create: settledOn("create", (args) => (args[0] as PHDocument).header.id),
    createEmpty: settledOn("createEmpty", () => ""),
    upgradeDocument: settledOn("upgradeDocument", first),
    execute: settledOn("execute", first, 1),
    executeBatch: async (request: BatchExecutionRequest) => {
      const result = (await call(mock, "executeBatch", [request])) as {
        jobs: Record<string, JobInfo>;
      };
      // The facade waited and handed back submission receipts; each job's
      // final state is the mock's getJobStatus, when it has one.
      const receipts: Record<string, WriteReceipt> = {};
      for (const [key, submitted] of Object.entries(result.jobs)) {
        const job =
          typeof mock.getJobStatus === "function"
            ? (((await call(mock, "getJobStatus", [submitted.id])) as
                | JobInfo
                | undefined) ?? submitted)
            : submitted;
        receipts[key] = {
          job,
          token: job.consistencyToken ?? EMPTY_TOKEN,
          documentId: job.documentId,
          branch: "main",
        };
      }
      return {
        jobs: result.jobs,
        handles: {},
        written: Promise.resolve(receipts),
        readable: Promise.resolve(receipts),
      } satisfies BatchWriteHandle;
    },
    rename: settledOn("rename", first, 2),
    setPreferredEditor: settledOn("setPreferredEditor", first, 2),
    addRelationship: settledOn("addRelationship", first, 4),
    updateRelationship: settledOn("updateRelationship", first, 4),
    removeRelationship: settledOn("removeRelationship", first, 3),
    moveRelationship: async (...args: unknown[]) => {
      const moved = (await call(mock, "moveRelationship", args)) as {
        source: PHDocument;
        target: PHDocument;
      };
      return {
        removed: settledHandle(idOf(moved.source, args[0] as string)),
        added: settledHandle(idOf(moved.target, args[1] as string)),
      };
    },
    deleteDocument: async (identifier: string, ...rest: unknown[]) => {
      await call(mock, "deleteDocument", [identifier, ...rest]);
      return settledHandle(identifier);
    },
    deleteDocuments: async (identifiers: string[], ...rest: unknown[]) => {
      await call(mock, "deleteDocuments", [identifiers, ...rest]);
      return identifiers.map((identifier) => settledHandle(identifier));
    },
    loadBatch: (...args: unknown[]) => call(mock, "loadBatch", args),
  } as unknown as IReactorWriteClient;
}

/**
 * The halves of a facade-shaped client: its own `read`/`write` when it has
 * them (a real facade), else the mock itself as the read half and
 * {@link facadeWriteHalf} over it.
 */
export function halvesOf(client: object): {
  read: IReactorReadClient;
  write: IReactorWriteClient;
} {
  const facade = client as Partial<IReactorClient>;
  const realRead = typeof facade.read?.get === "function";
  const realWrite = typeof facade.write?.execute === "function";
  return {
    read: realRead ? facade.read! : (client as IReactorReadClient),
    write: realWrite ? facade.write! : facadeWriteHalf(client as FacadeMock),
  };
}

/**
 * The clients a resolver of `operation` receives on the context, as the
 * GraphQL layer builds them: a mutation resolves identifiers on the write
 * half, and anything but a mutation may not write.
 */
export function clientsFor(
  client: object,
  operation: ClientOperation = "mutation",
): RequestClients {
  const { read, write } = halvesOf(client);
  return createRequestClients(read, write, operation);
}

/**
 * `ctx` with both halves and no operation attached, for tests that call one
 * resolver function directly: identifiers resolve on the read half, as before
 * the split, and a write is allowed.
 */
export function withHalves<TContext extends object>(
  ctx: TContext,
  client: object,
): TContext & { clients: RequestClients } {
  return { ...ctx, clients: halvesOf(client) };
}

/**
 * Clients for a context whose resolvers never reach the reactor (gateway and
 * transport tests): reading anything from them throws, and they may not write.
 */
export const UNUSED_CLIENTS: RequestClients = readOnlyClients(
  {} as IReactorReadClient,
);
