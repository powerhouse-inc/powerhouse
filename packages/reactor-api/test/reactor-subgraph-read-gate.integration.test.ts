import type {
  InProcessReactorClientModule,
  ISyncManager,
} from "@powerhousedao/reactor";
import { afterEach, describe, expect, it } from "vitest";
import { ReactorSubgraph } from "../src/graphql/reactor/subgraph.js";
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
type OperationsPage = { items: { action: { type: string } }[] };

/**
 * A document the caller may read no domain scope of is answered by the
 * reactor subgraph exactly as an id that was never there. `get` alone would
 * serve its husk — header, `auth` and `document` scopes — which says that the
 * id exists, what the document is named and who is granted what.
 */
describe("reactor subgraph reads withhold what the read gate withholds", () => {
  let module: InProcessReactorClientModule | undefined;

  afterEach(() => {
    module?.reactor.kill();
    module = undefined;
  });

  async function fixture() {
    module = await buildReadGateReactor();
    const client = module.client;
    const secret = await createFixture(client, "rs-secret");
    await police(client, secret);
    const open = await createFixture(client, "rs-open");
    const subgraph = new ReactorSubgraph({
      reactorClient: client,
      syncManager: {} as ISyncManager,
      authorizationService: openAuthorization,
      graphqlManager: { driveOwnershipCache: { add: () => undefined } },
    } as unknown as SubgraphArgs);
    const query = (name: string) =>
      (subgraph.resolvers.Query as Record<string, Resolver>)[name];
    return { secret, open, query };
  }

  it("document answers a withheld document as a missing one, and serves what the caller may read", async () => {
    const { secret, open, query } = await fixture();
    const read = (identifier: string, address?: string) =>
      query("document")(undefined, { identifier }, contextFor(address));
    const missing = (id: string) =>
      `Failed to fetch document: Document not found: ${id}`;

    await expect(read("never-there", READER)).rejects.toThrow(
      missing("never-there"),
    );
    await expect(read(secret)).rejects.toThrow(missing(secret));
    await expect(read(secret, OUTSIDER)).rejects.toThrow(missing(secret));

    const served = (await read(secret, READER)) as { document: Served };
    expect(served.document.id).toBe(secret);
    expect(holdsGlobal(served.document)).toBe(true);
    expect(
      holdsGlobal(
        ((await read(open, OUTSIDER)) as { document: Served }).document,
      ),
    ).toBe(true);
  });

  it("documentOperations answers a withheld document as a missing one", async () => {
    const { secret, open, query } = await fixture();
    const operations = (documentId: string, address?: string) =>
      query("documentOperations")(
        undefined,
        { filter: { documentId } },
        contextFor(address),
      );
    const missing = (id: string) =>
      `Failed to fetch document operations: Document not found: ${id}`;

    await expect(operations("never-there", READER)).rejects.toThrow(
      missing("never-there"),
    );
    await expect(operations(secret)).rejects.toThrow(missing(secret));
    await expect(operations(secret, OUTSIDER)).rejects.toThrow(missing(secret));

    const page = (await operations(secret, READER)) as OperationsPage;
    expect(page.items.length).toBeGreaterThan(0);
    const openPage = (await operations(open, OUTSIDER)) as OperationsPage;
    expect(openPage.items.length).toBeGreaterThan(0);
  });
});
