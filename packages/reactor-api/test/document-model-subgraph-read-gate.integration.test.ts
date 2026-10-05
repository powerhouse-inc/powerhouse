import type {
  InProcessReactorClientModule,
  ISyncManager,
} from "@powerhousedao/reactor";
import type { DocumentModelModule } from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DocumentModelSubgraph } from "../src/graphql/document-model-subgraph.js";
import type { Context, SubgraphArgs } from "../src/graphql/types.js";
import {
  buildReadGateReactor,
  contextFor,
  createFixture,
  holdsGlobal,
  openAuthorization,
  OUTSIDER,
  police,
  READER,
} from "./utils/read-gate-fixture.js";

type Resolver = (p: unknown, a: unknown, c: Context) => Promise<unknown>;
type Served = { id: string; state: unknown };
type Page = { items: Served[] };

describe("generated document-model subgraph reads as the caller", () => {
  let module: InProcessReactorClientModule | undefined;

  afterEach(() => {
    module?.reactor.kill();
    module = undefined;
  });

  async function fixture() {
    module = await buildReadGateReactor();
    const client = module.client;
    const secret = await createFixture(client, "dm-secret");
    await police(client, secret);
    const open = await createFixture(client, "dm-open");
    const hub = await createFixture(client, "dm-hub");
    await client.addRelationship(hub, secret, "related");
    await client.addRelationship(hub, open, "related");
    await client.addRelationship(secret, open, "related");
    const subgraph = new DocumentModelSubgraph(
      documentModelDocumentModelModule as unknown as DocumentModelModule,
      {
        reactorClient: client,
        syncManager: {} as ISyncManager,
        authorizationService: openAuthorization,
        graphqlManager: {},
      } as unknown as SubgraphArgs,
    );
    const query = (name: string) =>
      (subgraph.queryResolvers as unknown as Record<string, Resolver>)[name];
    const mutation = (name: string) =>
      (subgraph.mutationResolvers as unknown as Record<string, Resolver>)[name];
    return { client, secret, open, hub, query, mutation };
  }

  const ids = (page: unknown) =>
    (page as Page).items.map((item) => item.id).sort();

  it("document strips the domain scopes a caller may not read", async () => {
    const { secret, query } = await fixture();
    const read = async (address?: string) =>
      holdsGlobal(
        (
          (await query("document")(
            undefined,
            { identifier: secret },
            contextFor(address),
          )) as { document: Served }
        ).document,
      );

    expect(await read()).toBe(false);
    expect(await read(OUTSIDER)).toBe(false);
    expect(await read(READER)).toBe(true);
  });

  it("documents and findDocuments withhold what a caller may not read", async () => {
    const { secret, open, hub, query } = await fixture();
    for (const name of ["documents", "findDocuments"]) {
      const list = async (address?: string) =>
        ids(await query(name)(undefined, {}, contextFor(address)));

      expect(await list(), name).toEqual([hub, open].sort());
      expect(await list(OUTSIDER), name).toEqual([hub, open].sort());
      expect(await list(READER), name).toEqual([hub, open, secret].sort());
    }
  });

  it("relationship queries withhold far ends a caller may not read", async () => {
    const { secret, open, hub, query } = await fixture();
    const outgoing = async (address?: string) =>
      ids(
        await query("documentOutgoingRelationships")(
          undefined,
          { sourceIdentifier: hub, relationshipType: "related" },
          contextFor(address),
        ),
      );
    const incoming = async (address?: string) =>
      ids(
        await query("documentIncomingRelationships")(
          undefined,
          { targetIdentifier: open, relationshipType: "related" },
          contextFor(address),
        ),
      );

    expect(await outgoing()).toEqual([open]);
    expect(await outgoing(OUTSIDER)).toEqual([open]);
    expect(await outgoing(READER)).toEqual([open, secret].sort());
    expect(await incoming()).toEqual([hub]);
    expect(await incoming(OUTSIDER)).toEqual([hub]);
    expect(await incoming(READER)).toEqual([hub, secret].sort());
  });

  it("an operation mutation returns the document read as the caller", async () => {
    const { secret, mutation } = await fixture();
    const run = async (address?: string) =>
      holdsGlobal(
        (await mutation("setModelName")(
          undefined,
          { docId: secret, input: { name: "touched" } },
          contextFor(address),
        )) as Served,
      );

    expect(await run()).toBe(false);
    expect(await run(OUTSIDER)).toBe(false);
    expect(await run(READER)).toBe(true);
  });

  it("createDocument renames and reads back as the caller", async () => {
    const { client, mutation } = await fixture();
    const execute = vi.spyOn(client, "execute");
    const get = vi.spyOn(client, "get");

    const created = (await mutation("createDocument")(
      undefined,
      { name: "named" },
      contextFor(OUTSIDER),
    )) as Served;

    const subject = { address: OUTSIDER, key: undefined };
    expect(get).toHaveBeenCalledWith(created.id, { subject });
    expect(execute).toHaveBeenLastCalledWith(
      created.id,
      "main",
      [expect.objectContaining({ type: "SET_NAME" })],
      undefined,
      subject,
    );
  });
});
