import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import type { PHDocument } from "@powerhousedao/shared/document-model";
import {
  initializeAuth,
  normalizeDocumentModelVersion,
  setGrant,
} from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule, setModelName } from "document-model";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createDocumentAction,
  upgradeDocumentAction,
} from "../../src/actions/index.js";
import type { ReactorClient } from "../../src/client/reactor-client.js";
import type { DocumentChangeEvent } from "../../src/client/types.js";
import { ReactorBuilder } from "../../src/core/reactor-builder.js";
import { ReactorClientBuilder } from "../../src/core/reactor-client-builder.js";
import type { IReactor } from "../../src/core/types.js";
import type { ReactorFeatureFlags } from "../../src/executor/types.js";
import type { IDocumentView } from "../../src/storage/interfaces.js";
import { createDocModelDocument } from "../factories.js";

const READER = "0xReader";
const OUTSIDER = "0xOutsider";

// A document serving no readable domain scope is withheld, not header-only.
describe("feed and listing reads", () => {
  let reactor: IReactor | undefined;
  let documentView: IDocumentView | undefined;

  afterEach(() => {
    reactor?.kill();
    reactor = undefined;
    documentView = undefined;
    vi.restoreAllMocks();
  });

  async function build(
    featureFlags: Partial<ReactorFeatureFlags> = {},
  ): Promise<ReactorClient> {
    const module = await new ReactorClientBuilder()
      .withReactorBuilder(
        new ReactorBuilder()
          .withDocumentModelSources([
            documentModelDocumentModelModule as never,
            driveDocumentModelModule as never,
          ])
          .withExecutorConfig({
            featureFlags: {
              documentDecisions: true,
              authEnforcement: true,
              ...featureFlags,
            },
          }),
      )
      .buildModule();

    reactor = module.reactor;
    documentView = module.documentView;
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

  // Upgraded with no initialState, so the read model indexes no domain scope.
  async function createUnindexed(
    client: ReactorClient,
    id: string,
  ): Promise<string> {
    const { header, state } = createDocModelDocument({ id });
    await client.execute(id, "main", [
      createDocumentAction({
        model: header.documentType,
        version: 0,
        documentId: id,
        signing: {
          signature: id,
          publicKey: header.sig.publicKey,
          nonce: header.sig.nonce,
          createdAtUtcIso: header.createdAtUtcIso,
          documentType: header.documentType,
        },
        slug: header.slug,
        name: header.name,
        branch: header.branch,
        meta: header.meta,
        protocolVersions: header.protocolVersions ?? { "base-reducer": 2 },
      }),
      upgradeDocumentAction({
        documentId: id,
        model: header.documentType,
        fromVersion: 0,
        toVersion: normalizeDocumentModelVersion(
          (state as Partial<typeof state>).document?.version,
        ),
      }),
    ]);
    return id;
  }

  function policeUnindexed(client: ReactorClient, id: string) {
    return client.execute(id, "main", [
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
            description: "only the admin administers",
            effect: "allow",
            principal: { address: "0xAdmin" },
            capability: { can: "execute", scope: "auth" },
          },
        ],
      }),
    ]);
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

    it("withholds an update to a policed document holding no domain scope yet", async () => {
      const client = await build();
      const policed = await createUnindexed(client, "feed-unindexed");
      const sentinel = await createOpen(client, "feed-unindexed-sentinel");

      const events = await feedAs(client, OUTSIDER, sentinel, () =>
        policeUnindexed(client, policed),
      );

      expect(events.flatMap(idsOf)).not.toContain(policed);
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

    it("withhold a policed document holding no domain scope yet", async () => {
      const client = await build();
      const policed = await createUnindexed(client, "list-unindexed");
      await policeUnindexed(client, policed);

      const asOutsider = await client.find(
        { ids: [policed] },
        { subject: { address: OUTSIDER } },
      );
      const asReader = await client.find(
        { ids: [policed] },
        { subject: { address: READER } },
      );

      expect(Object.keys((await reactor!.get(policed)).state).sort()).toEqual([
        "auth",
        "document",
      ]);
      expect(asOutsider.results).toEqual([]);
      expect(asReader.results.map((d) => d.header.id)).toEqual([policed]);
    });

    it("answer isServed as find does", async () => {
      const client = await build();
      const unindexed = await createUnindexed(client, "served-unindexed");
      await policeUnindexed(client, unindexed);
      const open = await createOpen(client, "served-open");

      const served = (id: string, address?: string) =>
        client.isServed(id, { subject: { address } });

      expect(await served(unindexed, OUTSIDER)).toBe(false);
      expect(await served(unindexed)).toBe(false);
      expect(await served(unindexed, READER)).toBe(true);
      expect(await served(open, OUTSIDER)).toBe(true);
      expect(await served("served-absent", READER)).toBe(false);
    });

    it("read only the view's scopes and the policy for a narrowed view", async () => {
      const client = await build();
      const policed = await createPoliced(client, "narrow-policed");
      const open = await createOpen(client, "narrow-open");
      const getMany = vi.spyOn(documentView!, "getMany");
      const get = vi.spyOn(documentView!, "get");

      const asOutsider = await client.find(
        { ids: [policed, open] },
        { scopes: ["document"], subject: { address: OUTSIDER } },
      );
      const asReader = await client.find(
        { ids: [policed, open] },
        { scopes: ["document"], subject: { address: READER } },
      );

      expect(getMany).toHaveBeenCalledTimes(2);
      for (const call of getMany.mock.calls) {
        expect(call[1]?.scopes).toEqual(["document", "auth"]);
      }
      expect(get).not.toHaveBeenCalled();
      expect(asOutsider.results.map((d) => d.header.id)).toEqual([open]);
      expect(asReader.results.map((d) => d.header.id).sort()).toEqual(
        [open, policed].sort(),
      );
      for (const document of asReader.results) {
        expect(Object.keys(document.state).sort()).toEqual([
          "auth",
          "document",
        ]);
      }
    });

    it("read a scope a condition decides on when the view leaves it out", async () => {
      const client = await build({ authGroups: true, authConditions: true });
      const id = await createOpen(client, "narrow-conditioned");
      await client.execute(id, "main", [
        initializeAuth({
          version: 1,
          grants: [
            {
              id: "g-write",
              description: "anyone writes the domain",
              effect: "allow",
              principal: { anyone: true },
              capability: { can: "execute", scope: "global" },
            },
            {
              id: "g-hide",
              description: "the outsider loses it once it is named secret",
              effect: "deny",
              principal: { address: OUTSIDER },
              capability: { can: "read", scope: "global" },
              where: { eq: [{ attr: "doc.global.name" }, { lit: "secret" }] },
            },
            {
              id: "g-admin",
              description: "administration stays reachable",
              effect: "allow",
              principal: { anyone: true },
              capability: { can: "execute", scope: "auth" },
            },
          ],
        }),
      ]);
      await client.execute(id, "main", [setModelName({ name: "secret" })]);

      const narrowed = await client.find(
        { ids: [id] },
        { scopes: ["document"], subject: { address: OUTSIDER } },
      );
      const whole = await client.find(
        { ids: [id] },
        { subject: { address: OUTSIDER } },
      );

      expect(whole.results).toEqual([]);
      expect(narrowed.results).toEqual([]);
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
