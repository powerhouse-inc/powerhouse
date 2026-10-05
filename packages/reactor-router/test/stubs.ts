import type {
  DocumentChangeEvent,
  IReactorClient,
  JobInfo,
  PagedResults,
  PagingOptions,
  SearchFilter,
} from "@powerhousedao/reactor";
import {
  reactorCapabilities,
  remoteReactorCapabilities,
  type ReactorCapabilities,
} from "@powerhousedao/reactor-monitor";
import type { PHDocument } from "@powerhousedao/shared/document-model";
import { ReactorOperationNotSupportedError } from "../src/errors.js";
import { withOwnershipGuard } from "../src/guard.js";
import type { ReactorBackend } from "../src/types.js";

/**
 * A stand-in reactor: an in-memory document set behind enough of
 * `IReactorClient` for the routing surface to be exercised without booting a
 * PGlite per backend.
 *
 * Every method the router actually calls is implemented; anything else throws
 * by name, so a routing change that starts calling a new method fails loudly
 * here instead of being silently answered with `undefined`.
 *
 * The real thing is exercised too -- `test/integration.test.ts` runs the same
 * router over real in-process reactors.
 */
export class FakeReactor {
  readonly documents = new Map<string, PHDocument>();
  readonly relationships: {
    sourceId: string;
    targetId: string;
    relationshipType: string;
  }[] = [];
  readonly calls: { method: string; args: readonly unknown[] }[] = [];
  readonly jobs = new Map<string, JobInfo>();
  readonly subscribers: ((event: DocumentChangeEvent) => void)[] = [];
  /** Methods that should fail, for the strict/tolerant fan-in tests. */
  readonly failing = new Set<string>();
  /**
   * Methods this reactor cannot serve BY CONTRACT, for the fan-in exclusion
   * tests. Mirrors the remote Switchboard backend: a capability-limited client
   * raises a typed {@link ReactorOperationNotSupportedError} the fan-in excludes
   * rather than counts as a failure.
   */
  readonly unsupported = new Set<string>();

  constructor(
    readonly name: string,
    readonly capabilities: ReactorCapabilities,
  ) {}

  /** A backend handle, with its client validating ownership like a real one. */
  backend(options: { guard: boolean } = { guard: true }): ReactorBackend {
    const client = this.client();
    return {
      name: this.name,
      capabilities: this.capabilities,
      client: options.guard
        ? withOwnershipGuard(client, { backendName: this.name })
        : client,
    };
  }

  /** Puts a document in this reactor's store. */
  seed(document: PHDocument): PHDocument {
    this.documents.set(document.header.id, document);
    if (document.header.slug !== "") {
      this.documents.set(document.header.slug, document);
    }
    return document;
  }

  /** Which methods were called, in order. */
  methods(): readonly string[] {
    return this.calls.map((call) => call.method);
  }

  called(method: string): boolean {
    return this.calls.some((call) => call.method === method);
  }

  emit(event: DocumentChangeEvent): void {
    for (const subscriber of [...this.subscribers]) {
      subscriber(event);
    }
  }

  private record(method: string, args: readonly unknown[]): void {
    this.calls.push({ method, args });
    if (this.unsupported.has(method)) {
      throw new ReactorOperationNotSupportedError({
        backend: this.name,
        operation: method,
      });
    }
    if (this.failing.has(method)) {
      throw new Error(`${this.name}: ${method} is configured to fail`);
    }
  }

  private require(identifier: string, method: string): PHDocument {
    const document = this.documents.get(identifier);
    if (document === undefined) {
      throw new Error(
        `${this.name}: ${method} found no document ${JSON.stringify(identifier)}`,
      );
    }
    return document;
  }

  private client(): IReactorClient {
    const implemented: Record<string, unknown> = {
      drives: {
        create: (input: {
          id?: string;
          slug?: string;
          global: { name: string };
        }) => {
          this.record("drives.create", [input]);
          return Promise.resolve(
            this.seed(
              fakeDocument({
                id: input.id ?? `drive-${this.documents.size}`,
                slug: input.slug ?? "",
                documentType: "powerhouse/document-drive",
                name: input.global.name,
              }),
            ),
          );
        },
        addFolder: (driveIdentifier: string, name: string) => {
          this.record("drives.addFolder", [driveIdentifier, name]);
          this.require(driveIdentifier, "drives.addFolder");
          return Promise.resolve({
            id: `folder-${name}`,
            name,
            kind: "folder",
          });
        },
        getNode: (driveIdentifier: string, nodeId: string) => {
          this.record("drives.getNode", [driveIdentifier, nodeId]);
          this.require(driveIdentifier, "drives.getNode");
          return Promise.resolve({ id: nodeId, name: nodeId, kind: "folder" });
        },
        addFile: (driveIdentifier: string, document: PHDocument) => {
          this.record("drives.addFile", [driveIdentifier, document]);
          this.require(driveIdentifier, "drives.addFile");
          return Promise.resolve(this.seed(document));
        },
      },
      isServed: (identifier: string) => {
        this.record("isServed", [identifier]);
        return Promise.resolve(this.documents.has(identifier));
      },
      isDocumentIdTaken: (documentId: string) => {
        this.record("isDocumentIdTaken", [documentId]);
        return Promise.resolve(this.documents.has(documentId));
      },
      get: (identifier: string) => {
        this.record("get", [identifier]);
        return Promise.resolve(this.require(identifier, "get"));
      },
      resolveIdOrSlug: (identifier: string) => {
        this.record("resolveIdOrSlug", [identifier]);
        return Promise.resolve(
          this.require(identifier, "resolveIdOrSlug").header.id,
        );
      },
      find: (search: SearchFilter, _view: unknown, paging?: PagingOptions) => {
        this.record("find", [search, paging]);
        return Promise.resolve(this.page(search, paging));
      },
      execute: (identifier: string, _branch: string, actions: unknown[]) => {
        this.record("execute", [identifier, actions]);
        const document = this.require(identifier, "execute");
        const next = bumpRevision(document);
        this.documents.set(next.header.id, next);
        return Promise.resolve(next);
      },
      executeAsync: (identifier: string) => {
        this.record("executeAsync", [identifier]);
        this.require(identifier, "executeAsync");
        const job = fakeJob(`${this.name}-job-${this.jobs.size}`, identifier);
        this.jobs.set(job.id, job);
        return Promise.resolve(job);
      },
      rename: (identifier: string, name: string) => {
        this.record("rename", [identifier, name]);
        const document = this.require(identifier, "rename");
        const next = bumpRevision(document);
        next.header.name = name;
        this.documents.set(next.header.id, next);
        return Promise.resolve(next);
      },
      deleteDocument: (identifier: string) => {
        this.record("deleteDocument", [identifier]);
        this.require(identifier, "deleteDocument");
        return Promise.resolve();
      },
      deleteDocuments: (identifiers: string[]) => {
        this.record("deleteDocuments", [identifiers]);
        return Promise.resolve();
      },
      executeBatch: (request: {
        jobs: { key: string; documentId: string }[];
      }) => {
        this.record("executeBatch", [request]);
        const jobs: Record<string, JobInfo> = {};
        for (const plan of request.jobs) {
          const job = fakeJob(
            `${this.name}-batch-${plan.key}`,
            plan.documentId,
          );
          this.jobs.set(job.id, job);
          jobs[plan.key] = job;
        }
        return Promise.resolve({ jobs });
      },
      loadBatch: (request: { jobs: { key: string; documentId: string }[] }) => {
        this.record("loadBatch", [request]);
        const jobs: Record<string, JobInfo> = {};
        for (const plan of request.jobs) {
          jobs[plan.key] = fakeJob(
            `${this.name}-load-${plan.key}`,
            plan.documentId,
          );
        }
        return Promise.resolve({ jobs });
      },
      addRelationship: (
        sourceIdentifier: string,
        targetIdentifier: string,
        relationshipType: string,
      ) => {
        this.record("addRelationship", [
          sourceIdentifier,
          targetIdentifier,
          relationshipType,
        ]);
        const source = this.require(sourceIdentifier, "addRelationship");
        this.relationships.push({
          sourceId: source.header.id,
          targetId: targetIdentifier,
          relationshipType,
        });
        return Promise.resolve(source);
      },
      getOutgoingRelationshipEdges: (sourceIdentifier: string) => {
        this.record("getOutgoingRelationshipEdges", [sourceIdentifier]);
        // A reactor that does not hold the source cannot answer: the tolerant
        // fan-in exists for exactly this.
        this.require(sourceIdentifier, "getOutgoingRelationshipEdges");
        const now = new Date();
        return Promise.resolve({
          results: this.relationships
            .filter((edge) => edge.sourceId === sourceIdentifier)
            .map((edge) => ({ ...edge, createdAt: now, updatedAt: now })),
          options: { cursor: "", limit: 100 },
        });
      },
      getJobStatus: (jobId: string) => {
        this.record("getJobStatus", [jobId]);
        return Promise.resolve(this.jobs.get(jobId) ?? fakeJob(jobId, ""));
      },
      waitForJob: (jobId: string | JobInfo) => {
        const id = typeof jobId === "string" ? jobId : jobId.id;
        this.record("waitForJob", [id]);
        return Promise.resolve(this.jobs.get(id) ?? fakeJob(id, ""));
      },
      createEmpty: (documentModelType: string) => {
        this.record("createEmpty", [documentModelType]);
        return Promise.resolve(
          this.seed(
            fakeDocument({
              id: `${this.name}-doc-${this.documents.size}`,
              documentType: documentModelType,
            }),
          ),
        );
      },
      create: (document: PHDocument) => {
        this.record("create", [document.header.id]);
        return Promise.resolve(this.seed(document));
      },
      subscribe: (
        search: SearchFilter,
        callback: (event: DocumentChangeEvent) => void,
      ) => {
        this.record("subscribe", [search]);
        this.subscribers.push(callback);
        return () => {
          const index = this.subscribers.indexOf(callback);
          if (index >= 0) {
            this.subscribers.splice(index, 1);
          }
        };
      },
      getDocumentModelModules: () => {
        this.record("getDocumentModelModules", []);
        return Promise.resolve({
          results: [],
          options: { cursor: "", limit: 0 },
        });
      },
    };

    // A real client's methods are async, so a failure inside one is a
    // REJECTION rather than a synchronous throw. The stub has to behave the
    // same way or it tests a shape no reactor has. `subscribe` is the one
    // genuinely synchronous method on the interface.
    const asClient = promisified(implemented, new Set(["subscribe"]));
    asClient.drives = promisified(
      implemented.drives as Record<string, unknown>,
      new Set(),
    );

    return new Proxy(asClient, {
      get: (target, prop) => {
        const value = Reflect.get(target, prop) as unknown;
        if (value !== undefined) {
          return value;
        }
        if (typeof prop !== "string") {
          return undefined;
        }
        return () => {
          throw new Error(
            `${this.name}: FakeReactor does not implement ${prop}; add it to test/stubs.ts`,
          );
        };
      },
    }) as unknown as IReactorClient;
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
    const slugs = search.slugs;
    if (slugs !== undefined) {
      matching = matching.filter((document) =>
        slugs.includes(document.header.slug),
      );
    }
    const offset =
      paging?.cursor === "" || paging === undefined ? 0 : Number(paging.cursor);
    const limit = paging?.limit ?? matching.length;
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

/** Every function but the named ones returns a promise, rejecting on a throw. */
function promisified(
  source: Record<string, unknown>,
  sync: ReadonlySet<string>,
): Record<string, unknown> {
  const wrapped: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    if (typeof value !== "function" || sync.has(key)) {
      wrapped[key] = value;
      continue;
    }
    const method = value as (...args: unknown[]) => unknown;
    wrapped[key] = (...args: unknown[]): Promise<unknown> =>
      Promise.resolve().then(() => method(...args));
  }
  return wrapped;
}

/** The capability row of an in-memory in-process reactor (no workflows). */
export function inProcessCapabilities(name: string): ReactorCapabilities {
  return reactorCapabilities(
    { kind: "in-process", name, storage: { kind: "memory" } },
    { canSelfHeal: false, syncChannelTypes: ["gql", "local"] },
  );
}

/** The capability row of a Node host that reports a composed workflow engine. */
export function workflowCapabilities(name: string): ReactorCapabilities {
  return remoteReactorCapabilities(
    { kind: "remote", name, remote: { url: `http://localhost/${name}` } },
    { workflows: true, syncChannelTypes: ["polling"] },
  );
}

let documentCounter = 0;

/** A minimal `PHDocument`: a header the router reads and nothing it does not. */
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
  const revision = { ...document.header.revision };
  revision.global = revision.global + 1;
  return {
    ...document,
    header: {
      ...document.header,
      revision,
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
