import type {
  BatchExecutionRequest,
  DocumentChangeEvent,
  JobInfo,
  PagedResults,
  PagingOptions,
  ReactorInfo,
  SearchFilter,
} from "@powerhousedao/reactor";
import type { PHDocument } from "@powerhousedao/shared/document-model";
import type {
  BackendSupports,
  IRoutableBackend,
  RoutableBackendConfig,
} from "../src/backend.js";
import { RouterBackend } from "../src/backend.js";
import { WrongBackendError } from "../src/errors.js";
import type { ReactorReach } from "../src/types.js";

export const IN_PROCESS: ReactorReach = Object.freeze({
  hosting: "in-process",
  inspection: "direct",
});

export const REMOTE: ReactorReach = Object.freeze({
  hosting: "remote",
  inspection: "rpc",
});

/** An in-memory, non-durable reactor without workflows. */
export function memoryInfo(syncChannels: readonly string[] = []): ReactorInfo {
  return {
    storage: {
      engine: "pglite",
      persistence: "memory",
      durable: false,
      selfHeal: false,
    },
    workflows: false,
    syncChannels,
    access: { admin: false, sql: false },
  };
}

/** A durable Postgres host with workflows composed. */
export function workflowInfo(
  syncChannels: readonly string[] = ["polling"],
): ReactorInfo {
  return {
    storage: {
      engine: "postgres",
      persistence: "server",
      durable: true,
      selfHeal: false,
    },
    workflows: true,
    syncChannels,
    access: { admin: false, sql: false },
  };
}

type Member = keyof IRoutableBackend;

/** An in-memory backend that records every call. */
export class FakeBackend {
  readonly documents = new Map<string, PHDocument>();
  readonly relationships: {
    sourceId: string;
    targetId: string;
    relationshipType: string;
  }[] = [];
  readonly calls: { method: string; args: readonly unknown[] }[] = [];
  readonly jobs = new Map<string, JobInfo>();
  readonly subscribers: ((event: DocumentChangeEvent) => void)[] = [];
  readonly failing = new Set<string>();
  /** Optional members this backend does not declare. */
  readonly undeclared = new Set<Member>();
  supports: BackendSupports = { find: () => true, pointInTimeViews: true };
  /** Refuses a write for a document it lacks with WrongBackendError. */
  refuses = false;
  /** Declares a non-waiting submit. */
  submits = false;

  constructor(
    readonly name: string,
    readonly info: ReactorInfo = memoryInfo(),
    readonly reach: ReactorReach = IN_PROCESS,
  ) {}

  config(
    overrides: Partial<RoutableBackendConfig> = {},
  ): RoutableBackendConfig {
    return {
      name: this.name,
      backend: this.api(),
      facts: this.info,
      reach: this.reach,
      refusesMisroutes: this.refuses,
      ...overrides,
    };
  }

  handle(overrides: Partial<RoutableBackendConfig> = {}): RouterBackend {
    return new RouterBackend(this.config(overrides));
  }

  seed(document: PHDocument): PHDocument {
    this.documents.set(document.header.id, document);
    if (document.header.slug !== "") {
      this.documents.set(document.header.slug, document);
    }
    return document;
  }

  methods(): readonly string[] {
    return this.calls.map((call) => call.method);
  }

  called(method: string): boolean {
    return this.calls.some((call) => call.method === method);
  }

  count(method: string): number {
    return this.calls.filter((call) => call.method === method).length;
  }

  emit(event: DocumentChangeEvent): void {
    for (const subscriber of [...this.subscribers]) {
      subscriber(event);
    }
  }

  private record(method: string, args: readonly unknown[]): void {
    this.calls.push({ method, args });
    if (this.failing.has(method)) {
      throw new Error(`${this.name}: ${method} is configured to fail`);
    }
  }

  private require(identifier: string, method: string): PHDocument {
    const document = this.documents.get(identifier);
    if (document === undefined) {
      const error = new Error(
        `${this.name}: ${method} found no document ${JSON.stringify(identifier)}`,
      );
      error.name = "DocumentNotFoundError";
      throw error;
    }
    return document;
  }

  private refuseUnless(identifier: string, method: string): void {
    if (this.refuses && !this.documents.has(identifier)) {
      throw new WrongBackendError({
        documentId: identifier,
        rejectedBy: this.name,
        operation: method,
      });
    }
  }

  private own(identifier: string, method: string): PHDocument {
    if (this.refuses && !this.documents.has(identifier)) {
      throw new WrongBackendError({
        documentId: identifier,
        rejectedBy: this.name,
        operation: method,
      });
    }
    return this.require(identifier, method);
  }

  private run<T>(method: string, args: readonly unknown[], body: () => T) {
    return Promise.resolve().then(() => {
      this.record(method, args);
      return body();
    });
  }

  api(): IRoutableBackend {
    const api: IRoutableBackend = {
      supports: this.supports,
      get: <T extends PHDocument>(identifier: string) =>
        this.run(
          "get",
          [identifier],
          () => this.require(identifier, "get") as T,
        ),
      getOperations: (identifier) =>
        this.run("getOperations", [identifier], () => {
          this.require(identifier, "getOperations");
          return { results: [], options: { cursor: "", limit: 0 } };
        }),
      find: (search, _view, paging) =>
        this.run("find", [search, paging], () => this.page(search, paging)),
      isServed: (identifier) =>
        this.run("isServed", [identifier], () =>
          this.documents.has(identifier),
        ),
      getOutgoingRelationships: (identifier) =>
        this.run("getOutgoingRelationships", [identifier], () => {
          this.require(identifier, "getOutgoingRelationships");
          return { results: [], options: { cursor: "", limit: 0 } };
        }),
      getIncomingRelationships: (identifier) =>
        this.run("getIncomingRelationships", [identifier], () => {
          this.require(identifier, "getIncomingRelationships");
          return { results: [], options: { cursor: "", limit: 0 } };
        }),
      getOutgoingRelationshipEdges: (identifier) =>
        this.run("getOutgoingRelationshipEdges", [identifier], () => {
          this.require(identifier, "getOutgoingRelationshipEdges");
          const now = new Date();
          return {
            results: this.relationships
              .filter((edge) => edge.sourceId === identifier)
              .map((edge) => ({ ...edge, createdAt: now, updatedAt: now })),
            options: { cursor: "", limit: 100 },
          };
        }),
      getIncomingRelationshipEdges: (identifier) =>
        this.run("getIncomingRelationshipEdges", [identifier], () => {
          this.require(identifier, "getIncomingRelationshipEdges");
          return { results: [], options: { cursor: "", limit: 0 } };
        }),
      subscribe: (search, callback) => {
        this.record("subscribe", [search]);
        this.subscribers.push(callback);
        return () => {
          const index = this.subscribers.indexOf(callback);
          if (index >= 0) {
            this.subscribers.splice(index, 1);
          }
        };
      },
      getCreateSignaturePolicy: () =>
        this.run("getCreateSignaturePolicy", [], () => "legacy" as const),
      getCreateProtocolVersions: (parent) =>
        this.run("getCreateProtocolVersions", [parent], () => ({
          "base-reducer": 2,
        })),
      create: <T extends PHDocument>(document: PHDocument, parent?: string) =>
        this.run("create", [document.header.id, parent], () => {
          if (parent !== undefined) {
            this.require(parent, "create");
          }
          return this.seed(document) as T;
        }),
      execute: <T extends PHDocument>(
        identifier: string,
        _branch: string,
        actions: unknown[],
      ) =>
        this.run("execute", [identifier, actions], () => {
          const document = this.own(identifier, "execute");
          const next = bumpRevision(document);
          for (const action of actions as {
            type?: string;
            input?: unknown;
          }[]) {
            if (action.type === "SET_NAME") {
              const input = action.input as string | { name: string };
              next.header.name = typeof input === "string" ? input : input.name;
            }
          }
          this.seed(next);
          return next as T;
        }),
      executeBatch: (request: BatchExecutionRequest) =>
        this.run("executeBatch", [request], () => {
          for (const plan of request.jobs) {
            const creates = (plan.actions as { type?: string }[]).some(
              (action) => action.type === "CREATE_DOCUMENT",
            );
            if (!creates) {
              this.refuseUnless(plan.documentId, "executeBatch");
            }
          }
          const jobs: Record<string, JobInfo> = {};
          for (const plan of request.jobs) {
            const job = fakeJob(
              `${this.name}-batch-${plan.key}`,
              plan.documentId,
            );
            this.jobs.set(job.id, job);
            jobs[plan.key] = job;
          }
          return { jobs };
        }),
      deleteDocument: (identifier) =>
        this.run("deleteDocument", [identifier], () => {
          this.own(identifier, "deleteDocument");
        }),
      setPreferredEditor: (identifier) =>
        this.run("setPreferredEditor", [identifier], () =>
          this.own(identifier, "setPreferredEditor"),
        ),
      getJob: (jobId) =>
        this.run("getJob", [jobId], () => this.jobs.get(jobId)),
      waitForJob: (job) => {
        const id = typeof job === "string" ? job : job.id;
        return this.run("waitForJob", [id], () => {
          const known = this.jobs.get(id);
          if (known === undefined) {
            throw new Error(`${this.name}: no job ${id}`);
          }
          return { ...known, status: "READ_READY" } as JobInfo;
        });
      },
      isDocumentIdTaken: (documentId) =>
        this.run("isDocumentIdTaken", [documentId], () =>
          this.documents.has(documentId),
        ),
      resolveIdOrSlug: (identifier) =>
        this.run(
          "resolveIdOrSlug",
          [identifier],
          () => this.require(identifier, "resolveIdOrSlug").header.id,
        ),
      evaluateActions: (identifier) =>
        this.run("evaluateActions", [identifier], () => {
          this.require(identifier, "evaluateActions");
          return { documentId: identifier, evaluations: [] } as never;
        }),
      loadBatch: (request) =>
        this.run("loadBatch", [request], () => {
          for (const plan of request.jobs) {
            this.refuseUnless(plan.documentId, "loadBatch");
          }
          const jobs: Record<string, JobInfo> = {};
          for (const plan of request.jobs) {
            jobs[plan.key] = fakeJob(
              `${this.name}-load-${plan.key}`,
              plan.documentId,
            );
          }
          return { jobs };
        }),
      addRelationship: (source, target, relationshipType) =>
        this.run("addRelationship", [source, target, relationshipType], () => {
          const document = this.own(source, "addRelationship");
          this.relationships.push({
            sourceId: document.header.id,
            targetId: target,
            relationshipType,
          });
          return document;
        }),
      updateRelationship: (source) =>
        this.run("updateRelationship", [source], () =>
          this.own(source, "updateRelationship"),
        ),
      removeRelationship: (source) =>
        this.run("removeRelationship", [source], () =>
          this.own(source, "removeRelationship"),
        ),
      moveRelationship: (sourceParent, targetParent) =>
        this.run("moveRelationship", [sourceParent, targetParent], () => ({
          source: this.own(sourceParent, "moveRelationship"),
          target: this.require(targetParent, "moveRelationship"),
        })),
      getDocumentModelModules: () =>
        this.run("getDocumentModelModules", [], () => ({
          results: [],
          options: { cursor: "", limit: 0 },
        })),
      getDocumentModelModule: (documentType) =>
        this.run("getDocumentModelModule", [documentType], () => {
          throw new Error(`${this.name}: no module ${documentType}`);
        }),
    };
    if (this.submits) {
      Object.assign(api, {
        submit: {
          execute: (identifier: string) =>
            this.run("submit.execute", [identifier], () => {
              this.own(identifier, "submit.execute");
              const job = fakeJob(
                `${this.name}-submitted-${identifier}`,
                identifier,
              );
              this.jobs.set(job.id, job);
              return job;
            }),
          create: (document: PHDocument, parent?: string) =>
            this.run("submit.create", [document.header.id, parent], () => {
              if (parent !== undefined) {
                this.require(parent, "submit.create");
              }
              this.seed(document);
              const job = fakeJob(
                `${this.name}-created-${document.header.id}`,
                document.header.id,
              );
              this.jobs.set(job.id, job);
              return { jobs: { create: job } };
            }),
        },
      });
    }
    for (const member of this.undeclared) {
      delete (api as Partial<Record<Member, unknown>>)[member];
    }
    return api;
  }

  private page(
    search: SearchFilter,
    paging?: PagingOptions,
  ): PagedResults<PHDocument> {
    const unique = new Map<string, PHDocument>();
    for (const document of this.documents.values()) {
      unique.set(document.header.id, document);
    }
    let matching = [...unique.values()];
    if (search.type !== undefined) {
      matching = matching.filter(
        (document) => document.header.documentType === search.type,
      );
    }
    const ids = search.ids;
    if (ids !== undefined) {
      matching = matching.filter((document) =>
        ids.includes(document.header.id),
      );
    }
    const offset =
      paging === undefined || paging.cursor === "" ? 0 : Number(paging.cursor);
    const limit = paging?.limit || matching.length;
    const slice = matching.slice(offset, offset + limit);
    const nextOffset = offset + slice.length;
    const page: PagedResults<PHDocument> = {
      results: slice,
      options: { cursor: paging?.cursor ?? "", limit },
    };
    if (nextOffset < matching.length) {
      return { ...page, nextCursor: String(nextOffset) };
    }
    return page;
  }
}

let documentCounter = 0;

export function fakeDocument(fields: {
  id: string;
  documentType?: string;
  slug?: string;
  name?: string;
}): PHDocument {
  documentCounter++;
  const now = new Date(
    Date.UTC(2026, 9, 4, 0, 0, documentCounter),
  ).toISOString();
  return {
    header: {
      id: fields.id,
      sig: { publicKey: {}, nonce: "" },
      documentType: fields.documentType ?? "test/document",
      createdAtUtcIso: now,
      slug: fields.slug ?? "",
      name: fields.name ?? fields.id,
      branch: "main",
      revision: { global: 0 },
      lastModifiedAtUtcIso: now,
      meta: {},
    },
    history: {},
    initialState: {},
    state: {},
    operations: {},
    clipboard: [],
    attachments: {},
  } as unknown as PHDocument;
}

function bumpRevision(document: PHDocument): PHDocument {
  return {
    ...document,
    header: {
      ...document.header,
      revision: {
        ...document.header.revision,
        global: document.header.revision.global + 1,
      },
      lastModifiedAtUtcIso: new Date(
        Date.parse(document.header.lastModifiedAtUtcIso) + 1000,
      ).toISOString(),
    },
  };
}

export function fakeJob(id: string, documentId: string): JobInfo {
  return {
    id,
    documentId,
    status: "PENDING",
    createdAtUtcIso: new Date(Date.UTC(2026, 9, 4)).toISOString(),
    consistencyToken: {
      version: 1,
      createdAtUtcIso: new Date(Date.UTC(2026, 9, 4)).toISOString(),
      coordinates: [],
    },
    meta: { batchId: `${id}-batch`, batchJobIds: [id] },
  } as unknown as JobInfo;
}

export const silent = (): void => {};
