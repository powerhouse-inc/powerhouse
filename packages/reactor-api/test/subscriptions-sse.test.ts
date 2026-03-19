import type {
  DocumentChangeEvent,
  IReactorClient,
} from "@powerhousedao/reactor";
import { DocumentChangeType } from "@powerhousedao/reactor";
import { documentModelDocumentModelModule } from "document-model";
import {
  GraphQLEnumType,
  GraphQLInputObjectType,
  GraphQLList,
  GraphQLNonNull,
  GraphQLObjectType,
  GraphQLSchema,
  GraphQLString,
  parse,
  subscribe,
} from "graphql";
import { setTimeout as delay } from "node:timers/promises";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createGraphQLSSEHandler } from "../src/graphql/sse.js";
import type { Context } from "../src/graphql/types.js";
import {
  matchesSearchFilter,
  toGqlDocumentChangeEvent,
} from "../src/graphql/reactor/adapters.js";
import {
  ensureGlobalDocumentSubscription,
  getPubSub,
  SUBSCRIPTION_TRIGGERS,
  type DocumentChangesPayload,
  type JobChangesPayload,
} from "../src/graphql/reactor/pubsub.js";
import { createSchema } from "../src/utils/create-schema.js";
import { gql } from "graphql-tag";

// ---- Type-defs-only schema for SSE handler creation tests (uses createSchema) ----
const testTypeDefs = gql`
  scalar JSONObject
  scalar DateTime

  input SearchFilterInput {
    type: String
    parentId: String
  }

  input ViewFilterInput {
    branch: String
    scopes: [String!]
  }

  enum DocumentChangeType {
    CREATED
    DELETED
    UPDATED
    PARENT_ADDED
    PARENT_REMOVED
    CHILD_ADDED
    CHILD_REMOVED
  }

  type Revision {
    scope: String!
    revision: Int!
  }

  type PHDocument {
    id: String!
    slug: String
    name: String!
    documentType: String!
    state: JSONObject!
    revisionsList: [Revision!]!
    createdAtUtcIso: DateTime!
    lastModifiedAtUtcIso: DateTime!
  }

  type DocumentChangeContext {
    parentId: String
    childId: String
  }

  type DocumentChangeEvent {
    type: DocumentChangeType!
    documents: [PHDocument!]!
    context: DocumentChangeContext
  }

  type JobChangeEvent {
    jobId: String!
    status: String!
    result: JSONObject!
    error: String
  }

  type Query {
    _empty: String
  }

  type Subscription {
    documentChanges(
      search: SearchFilterInput!
      view: ViewFilterInput
    ): DocumentChangeEvent!
    jobChanges(jobId: String!): JobChangeEvent!
  }
`;

// ---- Pure-graphql schema for subscribe() tests (avoids dual-module instanceOf issue) ----
const DocumentChangeTypeEnum = new GraphQLEnumType({
  name: "DocumentChangeType",
  values: {
    CREATED: { value: "CREATED" },
    DELETED: { value: "DELETED" },
    UPDATED: { value: "UPDATED" },
    PARENT_ADDED: { value: "PARENT_ADDED" },
    PARENT_REMOVED: { value: "PARENT_REMOVED" },
    CHILD_ADDED: { value: "CHILD_ADDED" },
    CHILD_REMOVED: { value: "CHILD_REMOVED" },
  },
});

const PHDocumentType = new GraphQLObjectType({
  name: "PHDocument",
  fields: {
    id: { type: new GraphQLNonNull(GraphQLString) },
    name: { type: new GraphQLNonNull(GraphQLString) },
    documentType: { type: new GraphQLNonNull(GraphQLString) },
    slug: { type: GraphQLString },
  },
});

const DocumentChangeContextType = new GraphQLObjectType({
  name: "DocumentChangeContext",
  fields: {
    parentId: { type: GraphQLString },
    childId: { type: GraphQLString },
  },
});

const DocumentChangeEventType = new GraphQLObjectType({
  name: "DocumentChangeEvent",
  fields: {
    type: { type: new GraphQLNonNull(DocumentChangeTypeEnum) },
    documents: {
      type: new GraphQLNonNull(
        new GraphQLList(new GraphQLNonNull(PHDocumentType)),
      ),
    },
    context: { type: DocumentChangeContextType },
  },
});

const JobChangeEventType = new GraphQLObjectType({
  name: "JobChangeEvent",
  fields: {
    jobId: { type: new GraphQLNonNull(GraphQLString) },
    status: { type: new GraphQLNonNull(GraphQLString) },
    error: { type: GraphQLString },
  },
});

const SearchFilterInputType = new GraphQLInputObjectType({
  name: "SearchFilterInput",
  fields: {
    type: { type: GraphQLString },
    parentId: { type: GraphQLString },
  },
});

function buildSubscriptionTestSchema(resolvers: {
  documentChanges?: {
    subscribe: () => AsyncIterableIterator<DocumentChangesPayload>;
    resolve: (payload: DocumentChangesPayload) => unknown;
  };
  jobChanges?: {
    subscribe: () => AsyncIterableIterator<JobChangesPayload>;
    resolve: (payload: JobChangesPayload) => unknown;
  };
}) {
  const subscriptionFields: Record<string, unknown> = {};

  if (resolvers.documentChanges) {
    subscriptionFields.documentChanges = {
      type: new GraphQLNonNull(DocumentChangeEventType),
      args: {
        search: { type: new GraphQLNonNull(SearchFilterInputType) },
      },
      subscribe: resolvers.documentChanges.subscribe,
      resolve: resolvers.documentChanges.resolve,
    };
  }

  if (resolvers.jobChanges) {
    subscriptionFields.jobChanges = {
      type: new GraphQLNonNull(JobChangeEventType),
      args: {
        jobId: { type: new GraphQLNonNull(GraphQLString) },
      },
      subscribe: resolvers.jobChanges.subscribe,
      resolve: resolvers.jobChanges.resolve,
    };
  }

  return new GraphQLSchema({
    query: new GraphQLObjectType({
      name: "Query",
      fields: { _empty: { type: GraphQLString } },
    }),
    subscription: new GraphQLObjectType({
      name: "Subscription",
      fields: subscriptionFields as never,
    }),
  });
}

/**
 * Create a real PHDocument using the document-model module utilities.
 */
function createTestDocument() {
  return documentModelDocumentModelModule.utils.createDocument();
}

describe("Subscription SSE Integration", () => {
  let mockReactorClient: IReactorClient;

  beforeEach(() => {
    vi.clearAllMocks();

    mockReactorClient = {
      subscribe: vi.fn((_search, _callback) => {
        return vi.fn();
      }),
      getJobStatus: vi.fn(),
    } as unknown as IReactorClient;
  });

  describe("SSE Handler Creation", () => {
    it("should create an SSE handler from a schema with subscriptions", () => {
      const schema = createSchema(
        [],
        {
          Query: { _empty: () => null },
          Subscription: {
            documentChanges: {
              subscribe: () =>
                getPubSub().asyncIterableIterator(
                  SUBSCRIPTION_TRIGGERS.DOCUMENT_CHANGES,
                ),
              resolve: (payload: DocumentChangesPayload) =>
                toGqlDocumentChangeEvent(payload.documentChanges),
            },
          },
        },
        testTypeDefs,
      );

      const handler = createGraphQLSSEHandler({
        schema,
        contextFactory: () =>
          ({
            headers: {},
            db: null,
          }) as unknown as Context,
      });

      expect(handler).toBeDefined();
      expect(typeof handler).toBe("function");
    });

    it("should accept a contextFactory that returns a Promise", () => {
      const schema = createSchema(
        [],
        { Query: { _empty: () => null } },
        testTypeDefs,
      );

      const handler = createGraphQLSSEHandler({
        schema,
        contextFactory: async () =>
          ({
            headers: {},
            db: null,
          }) as unknown as Context,
      });

      expect(handler).toBeDefined();
    });
  });

  describe("GraphQL Subscription Execution", () => {
    it("should execute a documentChanges subscription and receive events via PubSub", async () => {
      const schema = buildSubscriptionTestSchema({
        documentChanges: {
          subscribe: () => {
            ensureGlobalDocumentSubscription(mockReactorClient);
            return getPubSub().asyncIterableIterator(
              SUBSCRIPTION_TRIGGERS.DOCUMENT_CHANGES,
            );
          },
          resolve: (payload: DocumentChangesPayload) =>
            toGqlDocumentChangeEvent(payload.documentChanges),
        },
      });

      const subscriptionDocument = parse(`
        subscription {
          documentChanges(search: {}) {
            type
            documents {
              id
              name
              documentType
            }
          }
        }
      `);

      const result = await subscribe({
        schema,
        document: subscriptionDocument,
      });

      // subscribe() should return an AsyncIterable, not an error
      expect(Symbol.asyncIterator in (result as object)).toBe(true);
      const iterator = (result as AsyncIterableIterator<unknown>)[
        Symbol.asyncIterator
      ]();

      // Use a real document from the document-model module
      const doc = createTestDocument();

      const mockEvent: DocumentChangeEvent = {
        type: DocumentChangeType.Created,
        documents: [doc],
      };

      const payload: DocumentChangesPayload = {
        documentChanges: mockEvent,
        search: {},
      };

      // Publish after a microtask so the iterator is listening
      const nextPromise = iterator.next();
      await delay(10);
      void getPubSub().publish(
        SUBSCRIPTION_TRIGGERS.DOCUMENT_CHANGES,
        payload,
      );

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

    it("should execute a jobChanges subscription and receive events via PubSub", async () => {
      const schema = buildSubscriptionTestSchema({
        jobChanges: {
          subscribe: () =>
            getPubSub().asyncIterableIterator(
              SUBSCRIPTION_TRIGGERS.JOB_CHANGES,
            ),
          resolve: (payload: JobChangesPayload) => payload.jobChanges,
        },
      });

      const subscriptionDocument = parse(`
        subscription {
          jobChanges(jobId: "job-123") {
            jobId
            status
            error
          }
        }
      `);

      const result = await subscribe({
        schema,
        document: subscriptionDocument,
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

    it("should handle multiple sequential events on a subscription", async () => {
      const schema = buildSubscriptionTestSchema({
        documentChanges: {
          subscribe: () => {
            ensureGlobalDocumentSubscription(mockReactorClient);
            return getPubSub().asyncIterableIterator(
              SUBSCRIPTION_TRIGGERS.DOCUMENT_CHANGES,
            );
          },
          resolve: (payload: DocumentChangesPayload) =>
            toGqlDocumentChangeEvent(payload.documentChanges),
        },
      });

      const subscriptionDocument = parse(`
        subscription {
          documentChanges(search: {}) {
            type
            documents { id }
          }
        }
      `);

      const result = await subscribe({
        schema,
        document: subscriptionDocument,
      });
      const iterator = (result as AsyncIterableIterator<unknown>)[
        Symbol.asyncIterator
      ]();

      const doc1 = createTestDocument();
      const doc2 = createTestDocument();

      // Wait for the iterator to be ready, then publish
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

  describe("Subscription Filtering with Resolvers", () => {
    it("should filter documentChanges by document type", () => {
      const docModelDoc = createTestDocument();
      // The document-model module creates documents of type "powerhouse/document-model"
      expect(docModelDoc.header.documentType).toBe(
        "powerhouse/document-model",
      );

      const otherDoc = createTestDocument();
      // Override the header to simulate a different type
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

      const filter = { type: "powerhouse/document-model" };

      const matching = events.filter((payload) =>
        matchesSearchFilter(payload.documentChanges, filter),
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
        matchesSearchFilter(event.documentChanges, {
          parentId: "other-parent",
        }),
      ).toBe(false);
    });
  });

  describe("Schema with Subscriptions", () => {
    it("should create a valid schema that includes Subscription type", () => {
      const schema = createSchema(
        [],
        {
          Query: { _empty: () => null },
          Subscription: {
            documentChanges: {
              subscribe: () =>
                getPubSub().asyncIterableIterator(
                  SUBSCRIPTION_TRIGGERS.DOCUMENT_CHANGES,
                ),
              resolve: (payload: DocumentChangesPayload) =>
                toGqlDocumentChangeEvent(payload.documentChanges),
            },
            jobChanges: {
              subscribe: () =>
                getPubSub().asyncIterableIterator(
                  SUBSCRIPTION_TRIGGERS.JOB_CHANGES,
                ),
              resolve: (payload: JobChangesPayload) => payload.jobChanges,
            },
          },
        },
        testTypeDefs,
      );

      const subscriptionType = schema.getSubscriptionType();
      expect(subscriptionType).toBeDefined();
      expect(subscriptionType?.name).toBe("Subscription");

      const fields = subscriptionType!.getFields();
      expect(fields.documentChanges).toBeDefined();
      expect(fields.jobChanges).toBeDefined();
    });
  });
});
