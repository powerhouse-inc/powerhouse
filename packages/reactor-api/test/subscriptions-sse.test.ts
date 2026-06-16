import type { IReactorClient, ISyncManager } from "@powerhousedao/reactor";
import { DocumentChangeType } from "@powerhousedao/reactor";
import { documentModelDocumentModelModule } from "document-model";
import { buildSchema, print, subscribe, parse } from "graphql";
import { setTimeout as delay } from "node:timers/promises";
import { describe, expect, it, vi } from "vitest";
import { matchesSearchFilter } from "../src/graphql/reactor/adapters.js";
import {
  getPubSub,
  SUBSCRIPTION_TRIGGERS,
  type DocumentChangesPayload,
  type JobChangesPayload,
} from "../src/graphql/reactor/pubsub.js";
import {
  AuthorizationPolicy,
  type IAuthorizationService,
} from "../src/services/authorization.service.js";
import { ReactorSubgraph } from "../src/graphql/reactor/subgraph.js";
import { createGraphQLSSEHandler } from "../src/graphql/sse.js";
import type { Context, SubgraphArgs } from "../src/graphql/types.js";
import { createSchema } from "../src/utils/create-schema.js";

// Instantiate the actual ReactorSubgraph to get its typeDefs and resolvers.
// The mock reactorClient needs subscribe() (called by ensureGlobalDocumentSubscription)
// and getJobStatus() (called by ensureJobSubscription).
const mockReactorClient = {
  subscribe: vi.fn(() => vi.fn()),
  getJobStatus: vi.fn(),
} as unknown as IReactorClient;

/** Authorization stub that grants read to everyone unless overridden. */
function makeAuthorizationService(
  overrides: Partial<IAuthorizationService> = {},
): IAuthorizationService {
  return {
    config: {
      admins: [],
      defaultProtection: false,
      policy: AuthorizationPolicy.DOCUMENT_PERMISSIONS,
    },
    isSupremeAdmin: () => false,
    canCreate: () => false,
    canRead: () => Promise.resolve(true),
    canWrite: () => Promise.resolve(true),
    canManage: () => Promise.resolve(true),
    canMutate: () => Promise.resolve(true),
    ...overrides,
  };
}

function makeReactorSubgraph(
  authorizationService: IAuthorizationService,
): ReactorSubgraph {
  return new ReactorSubgraph({
    reactorClient: mockReactorClient,
    syncManager: {} as ISyncManager,
    authorizationService,
  } as SubgraphArgs);
}

const reactorSubgraph = makeReactorSubgraph(makeAuthorizationService());

/** Context with a verified reader identity, populated as in production. */
const readerContext = {
  user: { address: "0xreader" },
  headers: {},
  db: null,
} as unknown as Context;

/**
 * Build an executable schema for subscribe() tests.
 *
 * We use graphql's buildSchema + field patching (instead of Apollo's
 * buildSubgraphSchema) because vitest's vite transform creates separate
 * graphql module instances, causing subscribe() to reject Federation
 * schemas with "Cannot use GraphQLSchema from another module or realm".
 */
function buildSubscriptionSchema(subgraph: ReactorSubgraph = reactorSubgraph) {
  const schema = buildSchema(print(subgraph.typeDefs));
  const subscriptionType = schema.getSubscriptionType()!;
  const fields = subscriptionType.getFields();
  const resolvers = subgraph.resolvers.Subscription as Record<
    string,
    { subscribe: () => unknown; resolve: (payload: unknown) => unknown }
  >;
  for (const [name, resolver] of Object.entries(resolvers)) {
    if (fields[name]) {
      const field = fields[name] as unknown as Record<string, unknown>;
      field.subscribe = resolver.subscribe;
      field.resolve = resolver.resolve;
    }
  }
  return schema;
}

/** Build a Federation schema for SSE handler tests (doesn't use subscribe()). */
function buildFederationSchema() {
  return createSchema([], reactorSubgraph.resolvers, reactorSubgraph.typeDefs);
}

function createTestDocument() {
  return documentModelDocumentModelModule.utils.createDocument();
}

function documentWithId(id: string) {
  const doc = createTestDocument();
  return { ...doc, header: { ...doc.header, id } };
}

function firstEvent(result: unknown) {
  const iterator = (result as AsyncIterableIterator<unknown>)[
    Symbol.asyncIterator
  ]();
  return { iterator, next: iterator.next() };
}

describe("Subscription SSE Integration", () => {
  describe("SSE Handler Creation", () => {
    it("should create an SSE handler from the reactor schema", () => {
      const schema = buildFederationSchema();
      const handler = createGraphQLSSEHandler({
        schema,
        contextFactory: () => ({ headers: {}, db: null }) as unknown as Context,
      });

      expect(handler).toBeDefined();
      expect(typeof handler).toBe("function");
    });
  });

  describe("GraphQL Subscription Execution", () => {
    it("should receive documentChanges events via PubSub", async () => {
      const schema = buildSubscriptionSchema();

      const result = await subscribe({
        schema,
        contextValue: readerContext,
        document: parse(`
          subscription {
            documentChanges(search: {}) {
              type
              documents { id name documentType }
            }
          }
        `),
      });

      expect(Symbol.asyncIterator in (result as object)).toBe(true);
      const iterator = (result as AsyncIterableIterator<unknown>)[
        Symbol.asyncIterator
      ]();

      const doc = createTestDocument();
      const payload: DocumentChangesPayload = {
        documentChanges: {
          type: DocumentChangeType.Created,
          documents: [doc],
        },
        search: {},
      };

      const nextPromise = iterator.next();
      await delay(10);
      void getPubSub().publish(SUBSCRIPTION_TRIGGERS.DOCUMENT_CHANGES, payload);

      const next = await nextPromise;
      expect(next.done).toBe(false);
      expect(next.value).toEqual({
        data: {
          documentChanges: {
            type: "CREATED",
            documents: [
              expect.objectContaining({
                id: doc.header.id,
                name: doc.header.name,
                documentType: doc.header.documentType,
              }),
            ],
          },
        },
      });

      await iterator.return?.();
    });

    it("should receive jobChanges events via PubSub", async () => {
      const schema = buildSubscriptionSchema();

      const result = await subscribe({
        schema,
        contextValue: readerContext,
        document: parse(`
          subscription {
            jobChanges(jobId: "job-123") {
              jobId
              status
              error
            }
          }
        `),
      });

      expect(Symbol.asyncIterator in (result as object)).toBe(true);
      const iterator = (result as AsyncIterableIterator<unknown>)[
        Symbol.asyncIterator
      ]();

      const jobPayload: JobChangesPayload = {
        jobChanges: {
          jobId: "job-123",
          status: "COMPLETED",
          createdAt: "2024-01-01T00:00:00.000Z",
          completedAt: "2024-01-01T00:01:00.000Z",
          error: null,
          result: { output: "done" },
        },
        jobId: "job-123",
        documentId: "doc-1",
      };

      const nextPromise = iterator.next();
      await delay(10);
      void getPubSub().publish(SUBSCRIPTION_TRIGGERS.JOB_CHANGES, jobPayload);

      const next = await nextPromise;
      expect(next.done).toBe(false);
      expect(next.value).toEqual({
        data: {
          jobChanges: {
            jobId: "job-123",
            status: "COMPLETED",
            error: null,
          },
        },
      });

      await iterator.return?.();
    });

    it("should handle multiple sequential events", async () => {
      const schema = buildSubscriptionSchema();

      const result = await subscribe({
        schema,
        contextValue: readerContext,
        document: parse(`
          subscription {
            documentChanges(search: {}) {
              type
              documents { id }
            }
          }
        `),
      });

      const iterator = (result as AsyncIterableIterator<unknown>)[
        Symbol.asyncIterator
      ]();

      const doc1 = createTestDocument();
      const doc2 = createTestDocument();

      const firstPromise = iterator.next();
      await delay(10);
      void getPubSub().publish(SUBSCRIPTION_TRIGGERS.DOCUMENT_CHANGES, {
        documentChanges: {
          type: DocumentChangeType.Created,
          documents: [doc1],
        },
        search: {},
      } satisfies DocumentChangesPayload);

      const first = await firstPromise;
      expect(first.value).toEqual({
        data: {
          documentChanges: {
            type: "CREATED",
            documents: [expect.objectContaining({ id: doc1.header.id })],
          },
        },
      });

      const secondPromise = iterator.next();
      await delay(10);
      void getPubSub().publish(SUBSCRIPTION_TRIGGERS.DOCUMENT_CHANGES, {
        documentChanges: {
          type: DocumentChangeType.Updated,
          documents: [doc2],
        },
        search: {},
      } satisfies DocumentChangesPayload);

      const second = await secondPromise;
      expect(second.value).toEqual({
        data: {
          documentChanges: {
            type: "UPDATED",
            documents: [expect.objectContaining({ id: doc2.header.id })],
          },
        },
      });

      await iterator.return?.();
    });
  });

  describe("Subscription Filtering", () => {
    it("should filter documentChanges by document type", () => {
      const docModelDoc = createTestDocument();
      const otherDoc = createTestDocument();
      const otherTypedDoc = {
        ...otherDoc,
        header: {
          ...otherDoc.header,
          documentType: "powerhouse/budget-statement",
        },
      };

      const events: DocumentChangesPayload[] = [
        {
          documentChanges: {
            type: DocumentChangeType.Created,
            documents: [docModelDoc],
          },
          search: {},
        },
        {
          documentChanges: {
            type: DocumentChangeType.Created,
            documents: [otherTypedDoc],
          },
          search: {},
        },
      ];

      const matching = events.filter((p) =>
        matchesSearchFilter(p.documentChanges, {
          type: "powerhouse/document-model",
        }),
      );

      expect(matching).toHaveLength(1);
      expect(matching[0].documentChanges.documents[0].header.id).toBe(
        docModelDoc.header.id,
      );
    });

    it("should filter documentChanges by parentId", () => {
      const childDoc = createTestDocument();
      const event: DocumentChangesPayload = {
        documentChanges: {
          type: DocumentChangeType.ChildAdded,
          documents: [childDoc],
          context: { parentId: "parent-1", childId: childDoc.header.id },
        },
        search: {},
      };

      expect(
        matchesSearchFilter(event.documentChanges, { parentId: "parent-1" }),
      ).toBe(true);
      expect(
        matchesSearchFilter(event.documentChanges, { parentId: "other" }),
      ).toBe(false);
    });
  });

  describe("Subscription Authorization (S-H2)", () => {
    it("drops documentChanges events for documents the subscriber cannot read", async () => {
      const subgraph = makeReactorSubgraph(
        makeAuthorizationService({
          canRead: (documentId) =>
            Promise.resolve(documentId === "readable-doc"),
        }),
      );
      const schema = buildSubscriptionSchema(subgraph);

      const result = await subscribe({
        schema,
        contextValue: readerContext,
        document: parse(`
          subscription {
            documentChanges(search: {}) { type documents { id } }
          }
        `),
      });
      const { iterator, next: nextPromise } = firstEvent(result);

      await delay(10);
      // Unreadable document: must be dropped.
      void getPubSub().publish(SUBSCRIPTION_TRIGGERS.DOCUMENT_CHANGES, {
        documentChanges: {
          type: DocumentChangeType.Created,
          documents: [documentWithId("secret-doc")],
        },
        search: {},
      } as DocumentChangesPayload);
      await delay(10);
      // Readable document: must be delivered.
      void getPubSub().publish(SUBSCRIPTION_TRIGGERS.DOCUMENT_CHANGES, {
        documentChanges: {
          type: DocumentChangeType.Created,
          documents: [documentWithId("readable-doc")],
        },
        search: {},
      } as DocumentChangesPayload);

      const next = await nextPromise;
      expect(next.value).toEqual({
        data: {
          documentChanges: {
            type: "CREATED",
            documents: [expect.objectContaining({ id: "readable-doc" })],
          },
        },
      });

      await iterator.return?.();
    });

    it("drops relationship events whose context document is unreadable (empty documents array)", async () => {
      // A naive check over `documents` would pass these events (the array is
      // empty); the affected ids live in `context`.
      const subgraph = makeReactorSubgraph(
        makeAuthorizationService({
          canRead: (documentId) =>
            Promise.resolve(documentId === "visible-child"),
        }),
      );
      const schema = buildSubscriptionSchema(subgraph);

      const result = await subscribe({
        schema,
        contextValue: readerContext,
        document: parse(`
          subscription {
            documentChanges(search: {}) {
              type
              context { parentId childId }
            }
          }
        `),
      });
      const { iterator, next: nextPromise } = firstEvent(result);

      await delay(10);
      // ChildAdded references an unreadable parent -> must be dropped.
      void getPubSub().publish(SUBSCRIPTION_TRIGGERS.DOCUMENT_CHANGES, {
        documentChanges: {
          type: DocumentChangeType.ChildAdded,
          documents: [],
          context: { parentId: "secret-parent", childId: "visible-child" },
        },
        search: {},
      } as DocumentChangesPayload);
      await delay(10);
      // Deleted references only a readable child -> must be delivered.
      void getPubSub().publish(SUBSCRIPTION_TRIGGERS.DOCUMENT_CHANGES, {
        documentChanges: {
          type: DocumentChangeType.Deleted,
          documents: [],
          context: { childId: "visible-child" },
        },
        search: {},
      } as DocumentChangesPayload);

      const next = await nextPromise;
      expect(next.value).toEqual({
        data: {
          documentChanges: {
            type: "DELETED",
            context: { parentId: null, childId: "visible-child" },
          },
        },
      });

      await iterator.return?.();
    });

    it("delivers all documentChanges to a supreme admin without per-document checks", async () => {
      const canRead = vi.fn(() => Promise.resolve(false));
      const subgraph = makeReactorSubgraph(
        makeAuthorizationService({ isSupremeAdmin: () => true, canRead }),
      );
      const schema = buildSubscriptionSchema(subgraph);

      const result = await subscribe({
        schema,
        contextValue: { user: { address: "0xadmin" } } as unknown as Context,
        document: parse(`
          subscription {
            documentChanges(search: {}) { type documents { id } }
          }
        `),
      });
      const { iterator, next: nextPromise } = firstEvent(result);

      await delay(10);
      void getPubSub().publish(SUBSCRIPTION_TRIGGERS.DOCUMENT_CHANGES, {
        documentChanges: {
          type: DocumentChangeType.Created,
          documents: [documentWithId("any-doc")],
        },
        search: {},
      } as DocumentChangesPayload);

      const next = await nextPromise;
      expect(next.value).toEqual({
        data: {
          documentChanges: {
            type: "CREATED",
            documents: [expect.objectContaining({ id: "any-doc" })],
          },
        },
      });
      expect(canRead).not.toHaveBeenCalled();

      await iterator.return?.();
    });

    it("drops jobChanges events whose document the subscriber cannot read", async () => {
      const subgraph = makeReactorSubgraph(
        makeAuthorizationService({
          canRead: (documentId) =>
            Promise.resolve(documentId === "readable-doc"),
        }),
      );
      const schema = buildSubscriptionSchema(subgraph);

      const result = await subscribe({
        schema,
        contextValue: readerContext,
        document: parse(`
          subscription { jobChanges(jobId: "job-x") { jobId status } }
        `),
      });
      const { iterator, next: nextPromise } = firstEvent(result);

      await delay(10);
      // Same jobId, secret document -> dropped.
      void getPubSub().publish(SUBSCRIPTION_TRIGGERS.JOB_CHANGES, {
        jobChanges: {
          jobId: "job-x",
          status: "RUNNING",
          createdAt: "2024-01-01T00:00:00.000Z",
          completedAt: null,
          error: null,
          result: {},
        },
        jobId: "job-x",
        documentId: "secret-doc",
      } as JobChangesPayload);
      await delay(10);
      // Same jobId, readable document -> delivered.
      void getPubSub().publish(SUBSCRIPTION_TRIGGERS.JOB_CHANGES, {
        jobChanges: {
          jobId: "job-x",
          status: "COMPLETED",
          createdAt: "2024-01-01T00:00:00.000Z",
          completedAt: "2024-01-01T00:01:00.000Z",
          error: null,
          result: {},
        },
        jobId: "job-x",
        documentId: "readable-doc",
      } as JobChangesPayload);

      const next = await nextPromise;
      expect(next.value).toEqual({
        data: { jobChanges: { jobId: "job-x", status: "COMPLETED" } },
      });

      await iterator.return?.();
    });

    it("drops jobChanges events with an unknown document for non-admins (fail-closed)", async () => {
      // canRead would allow everything; the empty documentId guard must still
      // drop the event before canRead is consulted.
      const subgraph = makeReactorSubgraph(
        makeAuthorizationService({ canRead: () => Promise.resolve(true) }),
      );
      const schema = buildSubscriptionSchema(subgraph);

      const result = await subscribe({
        schema,
        contextValue: readerContext,
        document: parse(`
          subscription { jobChanges(jobId: "job-y") { jobId status } }
        `),
      });
      const { iterator, next: nextPromise } = firstEvent(result);

      await delay(10);
      void getPubSub().publish(SUBSCRIPTION_TRIGGERS.JOB_CHANGES, {
        jobChanges: {
          jobId: "job-y",
          status: "RUNNING",
          createdAt: "2024-01-01T00:00:00.000Z",
          completedAt: null,
          error: null,
          result: {},
        },
        jobId: "job-y",
        documentId: "",
      } as JobChangesPayload);
      await delay(10);
      void getPubSub().publish(SUBSCRIPTION_TRIGGERS.JOB_CHANGES, {
        jobChanges: {
          jobId: "job-y",
          status: "COMPLETED",
          createdAt: "2024-01-01T00:00:00.000Z",
          completedAt: "2024-01-01T00:01:00.000Z",
          error: null,
          result: {},
        },
        jobId: "job-y",
        documentId: "known-doc",
      } as JobChangesPayload);

      const next = await nextPromise;
      expect(next.value).toEqual({
        data: { jobChanges: { jobId: "job-y", status: "COMPLETED" } },
      });

      await iterator.return?.();
    });
  });

  describe("Schema Validation", () => {
    it("should include Subscription type with expected fields", () => {
      const schema = buildSubscriptionSchema();
      const subscriptionType = schema.getSubscriptionType();
      expect(subscriptionType).toBeDefined();

      const fields = subscriptionType!.getFields();
      expect(fields.documentChanges).toBeDefined();
      expect(fields.jobChanges).toBeDefined();
    });
  });
});
