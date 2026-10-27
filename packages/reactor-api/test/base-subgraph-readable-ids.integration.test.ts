import type { InProcessReactorClientModule } from "@powerhousedao/reactor";
import { withSignaturePolicy } from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import type { Kysely } from "kysely";
import { afterEach, describe, expect, it } from "vitest";
import { BaseSubgraph } from "../src/graphql/base-subgraph.js";
import { createRequestClients } from "../src/graphql/request-clients.js";
import type { Context, SubgraphArgs } from "../src/graphql/types.js";
import {
  AuthorizationPolicy,
  createAuthorizationService,
} from "../src/services/authorization.service.js";
import { DocumentPermissionService } from "../src/services/document-permission.service.js";
import { createGetParentIdsFn } from "../src/services/get-parent-ids.js";
import type { DocumentPermissionDatabase } from "../src/utils/db.js";
import {
  buildReadGateReactor,
  contextFor,
  createFixture,
} from "./utils/read-gate-fixture.js";
import { openReactorPermissionStore } from "./utils/reactor-permission-store.js";

const ADMIN = "0xadmin";
const READER = "0xreader";
const OUTSIDER = "0xoutsider";

describe("BaseSubgraph.filterReadableDocumentIds", () => {
  let module: InProcessReactorClientModule | undefined;
  let db: Kysely<DocumentPermissionDatabase> | undefined;

  afterEach(async () => {
    module?.reactor.kill();
    module = undefined;
    await db?.destroy();
    db = undefined;
  });

  async function fixture(policy: AuthorizationPolicy) {
    module = await buildReadGateReactor();
    const { client } = module;
    const open = await createFixture(client, "ids-open");
    const secret = "ids-secret";
    const secretDocument = withSignaturePolicy(
      documentModelDocumentModelModule.utils.createDocument(),
      "legacy",
      { id: secret },
    );
    secretDocument.header.slug = "the-secret";
    await client.create(secretDocument);

    db = await openReactorPermissionStore();
    const permissions = new DocumentPermissionService(db);
    await permissions.setDocumentProtection(secret, true);
    await permissions.grantPermission(secret, READER, "READ", ADMIN);

    const subgraph = new BaseSubgraph({
      reactorClient: client,
      documentPermissionService: permissions,
      authorizationService: createAuthorizationService(
        { admins: [ADMIN], defaultProtection: false, policy },
        permissions,
        createGetParentIdsFn(client),
      ),
      graphqlManager: {},
    } as unknown as SubgraphArgs);
    const ctx = (address?: string): Context => ({
      ...contextFor(address),
      clients: createRequestClients(client.read, client.write, "query"),
    });
    return { subgraph, ctx, open, secret, slug: "the-secret" };
  }

  it("keeps the ids the caller may read, in order", async () => {
    const { subgraph, ctx, open, secret } = await fixture(
      AuthorizationPolicy.DOCUMENT_PERMISSIONS,
    );
    const ids = [secret, open, "ids-missing"];

    expect(await subgraph.filterReadableDocumentIds(ids, ctx())).toEqual([
      open,
    ]);
    expect(
      await subgraph.filterReadableDocumentIds(ids, ctx(OUTSIDER)),
    ).toEqual([open]);
    expect(await subgraph.filterReadableDocumentIds(ids, ctx(READER))).toEqual([
      secret,
      open,
    ]);
  });

  it("checks a slug against the document it names", async () => {
    const { subgraph, ctx, slug } = await fixture(
      AuthorizationPolicy.DOCUMENT_PERMISSIONS,
    );

    expect(
      await subgraph.filterReadableDocumentIds([slug], ctx(OUTSIDER)),
    ).toEqual([]);
    expect(
      await subgraph.filterReadableDocumentIds([slug], ctx(READER)),
    ).toEqual([slug]);
  });

  it("agrees with assertCanRead under every policy", async () => {
    for (const policy of Object.values(AuthorizationPolicy)) {
      const { subgraph, ctx, open, secret } = await fixture(policy);
      for (const address of [undefined, OUTSIDER, READER, ADMIN]) {
        const admitted: string[] = [];
        for (const id of [open, secret, "ids-missing"]) {
          const allowed = await subgraph.assertCanRead(id, ctx(address)).then(
            () => true,
            () => false,
          );
          if (allowed) admitted.push(id);
        }
        expect(
          await subgraph.filterReadableDocumentIds(
            [open, secret, "ids-missing"],
            ctx(address),
          ),
          `${policy} as ${address ?? "anonymous"}`,
        ).toEqual(admitted);
      }
      module?.reactor.kill();
      await db?.destroy();
      module = undefined;
      db = undefined;
    }
  });
});
