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

const reactorSubgraph = new ReactorSubgraph({
  reactorClient: mockReactorClient,
  syncManager: {} as ISyncManager,
} as SubgraphArgs);

/**
 * Build an executable schema for subscribe() tests.
 *
 * We use graphql's buildSchema + field patching (instead of Apollo's
 * buildSubgraphSchema) because vitest's vite transform creates separate
 * graphql module instances, causing subscribe() to reject Federation
 * schemas with "Cannot use GraphQLSchema from another module or realm".
 */
function buildSubscriptionSchema() {
  const schema = buildSchema(print(reactorSubgraph.typeDefs));
  const subscriptionType = schema.getSubscriptionType()!;
  const fields = subscriptionType.getFields();
  const resolvers = reactorSubgraph.resolvers.Subscription as Record<
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
