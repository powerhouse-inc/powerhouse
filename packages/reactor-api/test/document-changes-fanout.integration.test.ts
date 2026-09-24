import {
  DocumentChangeType,
  ReactorBuilder,
  ReactorClientBuilder,
  type DocumentChangeEvent,
  type IReadGate,
  type InProcessReactorClientModule,
} from "@powerhousedao/reactor";
import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import {
  initializeAuth,
  setGrant,
  type DocumentModelModule,
} from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import { setTimeout as delay } from "node:timers/promises";
import { afterEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { DocumentChangeFeed } from "../src/graphql/reactor/pubsub.js";

// Reads the change feed makes per event, per distinct subscribed subject.
describe("documentChanges read cost per distinct subject", () => {
  let module: InProcessReactorClientModule | undefined;

  afterEach(() => {
    module?.reactor.kill();
    module = undefined;
    vi.restoreAllMocks();
  });

  async function build() {
    module = await new ReactorClientBuilder()
      .withReactorBuilder(
        new ReactorBuilder()
          .withDocumentModelSources([
            driveDocumentModelModule as unknown as DocumentModelModule,
            documentModelDocumentModelModule as unknown as DocumentModelModule,
          ])
          .withExecutorConfig({
            featureFlags: { documentDecisions: true, authEnforcement: true },
          }),
      )
      .buildModule();
    return module;
  }

  async function createPoliced(
    client: InProcessReactorClientModule["client"],
    id: string,
  ) {
    const document = documentModelDocumentModelModule.utils.createDocument();
    document.header.id = id;
    await client.create(document);
    await client.execute(id, "main", [
      initializeAuth({
        version: 1,
        grants: [
          {
            id: "g-read",
            description: "anyone reads the domain",
            effect: "allow",
            principal: { anyone: true },
            capability: { can: "read", scope: "global" },
          },
          {
            id: "g-auth",
            description: "anyone administers",
            effect: "allow",
            principal: { anyone: true },
            capability: { can: "execute", scope: "auth" },
          },
          {
            id: "g-document",
            description: "anyone relates and deletes",
            effect: "allow",
            principal: { anyone: true },
            capability: { can: "execute", scope: "document" },
          },
        ],
      }),
    ]);
    return id;
  }

  type Counts = {
    viewGet: number;
    viewExists: number;
    gate: number;
  };

  function spies(m: InProcessReactorClientModule) {
    const gate = (m.client as unknown as { readGate: IReadGate }).readGate;
    const all: Record<keyof Counts, MockInstance> = {
      viewGet: vi.spyOn(m.documentView, "get"),
      viewExists: vi.spyOn(m.documentView, "exists"),
      gate: vi.spyOn(gate, "scopePredicate"),
    };
    return {
      reset: () => Object.values(all).forEach((spy) => spy.mockClear()),
      counts: (): Counts => ({
        viewGet: all.viewGet.mock.calls.length,
        viewExists: all.viewExists.mock.calls.length,
        gate: all.gate.mock.calls.length,
      }),
    };
  }

  function subscribeAll(m: InProcessReactorClientModule, subjects: number) {
    const feed = new DocumentChangeFeed(m.client);
    return Array.from({ length: subjects }, (_, i) => {
      const iterator = feed.subscribe({ address: `0xsubject-${i}` });
      const received: DocumentChangeEvent[] = [];
      const pump = (async () => {
        for (;;) {
          const next = await iterator.next();
          if (next.done) return;
          received.push(next.value.documentChanges);
        }
      })();
      return {
        received,
        stop: async () => {
          await iterator.return?.();
          await pump;
        },
      };
    });
  }

  async function costPerEvent(subjects: number) {
    const m = await build();
    const { client } = m;
    const parent = await createPoliced(client, "fanout-parent");
    const child = await createPoliced(client, "fanout-child");
    const feeds = subscribeAll(m, subjects);
    const { reset, counts } = spies(m);

    const measure = async (
      act: () => Promise<unknown>,
      delivered: (event: DocumentChangeEvent) => boolean,
    ): Promise<Counts> => {
      reset();
      await act();
      await vi.waitUntil(() => feeds.every((f) => f.received.some(delivered)), {
        timeout: 20_000,
        interval: 5,
      });
      await delay(20);
      return counts();
    };

    const created = await measure(
      () => {
        const document =
          documentModelDocumentModelModule.utils.createDocument();
        document.header.id = "fanout-created";
        return client.create(document);
      },
      (e) =>
        e.type === DocumentChangeType.Created &&
        e.documents.some((d) => d.header.id === "fanout-created"),
    );

    const updated = await measure(
      () =>
        client.execute(child, "main", [
          setGrant({
            grant: {
              id: "g-touch",
              description: "a policy write, so the document changes",
              effect: "allow",
              principal: { address: "0xnobody" },
              capability: { can: "read", scope: "local" },
            },
          }),
        ]),
      (e) =>
        e.type === DocumentChangeType.Updated &&
        e.documents.some((d) => d.header.id === child),
    );

    const childAdded = await measure(
      () => client.addRelationship(parent, child, "child"),
      (e) =>
        e.type === DocumentChangeType.ChildAdded &&
        e.context?.childId === child,
    );

    const deleted = await measure(
      () => client.deleteDocument("fanout-created"),
      (e) =>
        e.type === DocumentChangeType.Deleted &&
        e.context?.childId === "fanout-created",
    );

    await Promise.all(feeds.map((f) => f.stop()));
    return { created, updated, childAdded, deleted };
  }

  /**
   * Every distinct subject holds its own reactor subscription, so each event is
   * fetched and gated once per subject. A document fetch is three uncached
   * queries; a gate on a policed document builds its decision model.
   */
  it.each([1, 10, 100])(
    "repeats every event's reads once per distinct subject (N=%i)",
    async (n) => {
      const cost = await costPerEvent(n);

      expect(cost.created).toEqual({
        viewGet: n + 1,
        viewExists: 0,
        gate: n + 1,
      });
      expect(cost.updated).toEqual({ viewGet: 2, viewExists: 0, gate: n + 1 });
      expect(cost.childAdded).toEqual({
        viewGet: 2 * n + 1,
        viewExists: 0,
        gate: 2 * n + 1,
      });
      expect(cost.deleted).toEqual({ viewGet: n, viewExists: 0, gate: n });
    },
  );
});
