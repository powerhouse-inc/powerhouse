import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import type { PHDocument } from "@powerhousedao/shared/document-model";
import { initializeAuth, setGrant } from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule, setModelName } from "document-model";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactorClient } from "../../src/client/reactor-client.js";
import type { DocumentChangeEvent } from "../../src/client/types.js";
import { ReactorBuilder } from "../../src/core/reactor-builder.js";
import { ReactorClientBuilder } from "../../src/core/reactor-client-builder.js";
import type { IReactor } from "../../src/core/types.js";
import { createDocModelDocument } from "../factories.js";

const READER = "0xReader";
const OUTSIDER = "0xOutsider";

// A document serving no readable domain scope is withheld, not header-only.
describe("feed and listing reads", () => {
  let reactor: IReactor | undefined;

  afterEach(() => {
    reactor?.kill();
    reactor = undefined;
  });

  async function build(): Promise<ReactorClient> {
    const module = await new ReactorClientBuilder()
      .withReactorBuilder(
        new ReactorBuilder()
          .withDocumentModelSources([
            documentModelDocumentModelModule as never,
            driveDocumentModelModule as never,
          ])
          .withExecutorConfig({
            featureFlags: { documentDecisions: true, authEnforcement: true },
          }),
      )
      .buildModule();

    reactor = module.reactor;
    return module.client;
  }

  async function createPoliced(
    client: ReactorClient,
    id: string,
  ): Promise<string> {
    await client.create(createDocModelDocument({ id }));
    await client.execute(id, "main", [
      initializeAuth({
        version: 1,
        grants: [
          {
            id: "g-read",
            description: "the reader reads the domain",
            effect: "allow",
            principal: { address: READER },
            capability: { can: "read", scope: "global" },
          },
          {
            id: "g-admin",
            description: "administration stays reachable",
            effect: "allow",
            principal: { anyone: true },
            capability: { can: "execute", scope: "auth" },
          },
          {
            id: "g-delete",
            description: "anyone may delete",
            effect: "allow",
            principal: { anyone: true },
            capability: { can: "execute", scope: "document" },
          },
        ],
      }),
    ]);
    return id;
  }

  async function createOpen(client: ReactorClient, id: string) {
    await client.create(createDocModelDocument({ id }));
    return id;
  }

  function touchPoliced(client: ReactorClient, id: string) {
    return client.execute(id, "main", [
      setGrant({
        grant: {
          id: "g-touch",
          description: "a policy write, so the document changes",
          effect: "allow",
          principal: { address: "0xNobody" },
          capability: { can: "read", scope: "local" },
        },
      }),
    ]);
  }

  function touchOpen(client: ReactorClient, id: string) {
    return client.execute(id, "main", [setModelName({ name: `n-${id}` })]);
  }

  /** Every document id an event names, in its documents or its context. */
  function idsOf(event: DocumentChangeEvent): string[] {
    return [
      ...event.documents.map((d: PHDocument) => d.header.id),
      event.context?.parentId,
      event.context?.childId,
    ].filter((id): id is string => id !== undefined);
  }

  // Delivery is ordered: once the sentinel arrives, `act`'s events are settled.
  async function feedAs(
    client: ReactorClient,
    address: string | undefined,
    sentinel: string,
    act: () => Promise<unknown>,
  ): Promise<DocumentChangeEvent[]> {
    const events: DocumentChangeEvent[] = [];
    const unsubscribe = client.subscribe({}, (event) => events.push(event), {
      subject: { address },
    });
    try {
      await act();
      await touchOpen(client, sentinel);
      await vi.waitUntil(
        () => events.some((event) => idsOf(event).includes(sentinel)),
        { timeout: 5000 },
      );
      return events;
    } finally {
      unsubscribe();
    }
  }

  describe("the change feed", () => {
    it("withholds an update to a document the subject cannot read", async () => {
      const client = await build();
      const policed = await createPoliced(client, "feed-policed");
      const open = await createOpen(client, "feed-open");
      const sentinel = await createOpen(client, "feed-sentinel");

      const events = await feedAs(client, OUTSIDER, sentinel, async () => {
        await touchPoliced(client, policed);
        await touchOpen(client, open);
      });

      const ids = events.flatMap(idsOf);
      expect(ids).toContain(open);
      expect(ids).not.toContain(policed);
    });

    it("withholds from an anonymous subject", async () => {
      const client = await build();
      const policed = await createPoliced(client, "feed-anon-policed");
      const sentinel = await createOpen(client, "feed-anon-sentinel");

      const events = await feedAs(client, undefined, sentinel, () =>
        touchPoliced(client, policed),
      );

      expect(events.flatMap(idsOf)).not.toContain(policed);
    });

    it("delivers to a subject the policy lets read a domain scope", async () => {
      const client = await build();
      const policed = await createPoliced(client, "feed-reader-policed");
      const sentinel = await createOpen(client, "feed-reader-sentinel");

      const events = await feedAs(client, READER, sentinel, () =>
        touchPoliced(client, policed),
      );

      const served = events
        .flatMap((event) => event.documents)
        .find((d) => d.header.id === policed);
      expect(served).toBeDefined();
      expect(Object.keys(served!.state)).toContain("global");
      expect(Object.keys(served!.state)).not.toContain("local");
    });

    it("withholds a relationship event naming an unreadable document", async () => {
      const client = await build();
      const policed = await createPoliced(client, "feed-rel-policed");
      const parent = await createOpen(client, "feed-rel-parent");
      const sentinel = await createOpen(client, "feed-rel-sentinel");

      const events = await feedAs(client, OUTSIDER, sentinel, () =>
        client.addRelationship(parent, policed, "child"),
      );

      expect(events.flatMap(idsOf)).not.toContain(policed);
    });

    it("withholds the deletion of an unreadable document", async () => {
      const client = await build();
      const policed = await createPoliced(client, "feed-del-policed");
      const sentinel = await createOpen(client, "feed-del-sentinel");

      const events = await feedAs(client, OUTSIDER, sentinel, () =>
        client.deleteDocument(policed),
      );

      expect(events.flatMap(idsOf)).not.toContain(policed);
    });
  });

  describe("listings", () => {
    it("withhold a document the subject cannot read", async () => {
      const client = await build();
      const policed = await createPoliced(client, "list-policed");
      const open = await createOpen(client, "list-open");

      const asOutsider = await client.find(
        { ids: [policed, open] },
        { subject: { address: OUTSIDER } },
      );
      const asReader = await client.find(
        { ids: [policed, open] },
        { subject: { address: READER } },
      );

      expect(asOutsider.results.map((d) => d.header.id)).toEqual([open]);
      expect(asReader.results.map((d) => d.header.id).sort()).toEqual(
        [open, policed].sort(),
      );
    });

    it("gate every page, not only the first", async () => {
      const client = await build();
      const open = await createOpen(client, "page-open");
      const policed = await createPoliced(client, "page-policed");

      const served: PHDocument[] = [];
      let pages = 1;
      let page = await client.find(
        { type: documentModelDocumentModelModule.documentModel.global.id },
        { subject: { address: OUTSIDER } },
        { cursor: "0", limit: 1 },
      );
      served.push(...page.results);
      while (page.next) {
        page = await page.next();
        pages++;
        served.push(...page.results);
      }

      expect(pages).toBeGreaterThan(1);
      expect(served.map((d) => d.header.id)).toContain(open);
      expect(served.map((d) => d.header.id)).not.toContain(policed);
      for (const document of served) {
        expect(Object.keys(document.state)).toContain("global");
      }
    });

    it("withhold an unreadable relationship target", async () => {
      const client = await build();
      const source = await createOpen(client, "rel-source");
      const policed = await createPoliced(client, "rel-policed");
      const open = await createOpen(client, "rel-open");
      await client.addRelationship(source, policed, "child");
      await client.addRelationship(source, open, "child");

      const targets = await client.getOutgoingRelationships(source, "child", {
        subject: { address: OUTSIDER },
      });

      expect(targets.results.map((d) => d.header.id)).toEqual([open]);
    });
  });
});
