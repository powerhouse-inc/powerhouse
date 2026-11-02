import { MemoryFS, PGlite } from "@electric-sql/pglite";
import {
  HardenedPGliteDialect,
  type InProcessReactorClientModule,
} from "@powerhousedao/reactor";
import {
  DriveNodeView,
  runReactorDriveMigrations,
  type ReactorDriveDatabase,
} from "@powerhousedao/reactor-drive";
import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import { documentModelDocumentModelModule } from "document-model";
import { Kysely } from "kysely";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  AuthorizationPolicy,
  type IAuthorizationService,
} from "../src/services/authorization.service.js";
import {
  buildReadGateReactor,
  createFixture,
  openAuthorization,
  OUTSIDER,
  police,
  READER,
} from "./utils/read-gate-fixture.js";
import {
  startReactorHttpServer,
  type ReactorHttpServer,
} from "./utils/reactor-http-server.js";

type WireNode = {
  id: string;
  driveId: string;
  name: string;
  parentFolder: string | null;
  documentType?: string;
  __typename: string;
};

type WirePage = {
  results: WireNode[];
  nextCursor: string | null;
  hasMore: boolean;
};

type GraphQLResponse<T> = {
  data?: T | null;
  errors?: { message: string; extensions?: { code?: string } }[];
};

const NODE_FIELDS = /* GraphQL */ `
  fragment Node on DriveNode {
    __typename
    ... on DriveFileNode {
      id
      driveId
      name
      parentFolder
      documentType
    }
    ... on DriveFolderNode {
      id
      driveId
      name
      parentFolder
    }
  }
`;

const LIST = /* GraphQL */ `
  query List(
    $driveId: ID!
    $parentFolder: ID
    $paging: PagingInput
    $kind: DriveNodeKind
  ) {
    driveNodes(
      driveId: $driveId
      parentFolder: $parentFolder
      paging: $paging
      kind: $kind
    ) {
      results {
        ...Node
      }
      nextCursor
      hasMore
    }
  }
  ${NODE_FIELDS}
`;

const NODE = /* GraphQL */ `
  query One($driveId: ID!, $id: ID!) {
    driveNode(driveId: $driveId, id: $id) {
      ...Node
    }
  }
  ${NODE_FIELDS}
`;

const DESCENDANTS = /* GraphQL */ `
  query Descendants($driveId: ID!, $root: ID!) {
    driveDescendants(driveId: $driveId, root: $root) {
      ...Node
    }
  }
  ${NODE_FIELDS}
`;

async function ask<T>(
  server: ReactorHttpServer,
  query: string,
  variables: Record<string, unknown>,
  bearer?: string,
): Promise<GraphQLResponse<T>> {
  const response = await fetch(server.url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
    },
    body: JSON.stringify({ query, variables }),
  });
  return (await response.json()) as GraphQLResponse<T>;
}

async function list(
  server: ReactorHttpServer,
  variables: Record<string, unknown>,
  bearer?: string,
): Promise<WirePage> {
  const response = await ask<{ driveNodes: WirePage }>(
    server,
    LIST,
    variables,
    bearer,
  );
  expect(response.errors).toBeUndefined();
  return response.data!.driveNodes;
}

const ids = (page: { results: { id: string }[] } | WireNode[]) =>
  (Array.isArray(page) ? page : page.results).map((node) => node.id).sort();

const refusingHost: IAuthorizationService = {
  config: {
    admins: [],
    defaultProtection: true,
    policy: AuthorizationPolicy.DOCUMENT_PERMISSIONS,
  },
  isSupremeAdmin: () => false,
  canCreate: () => true,
  canRead: () => Promise.resolve(false),
  canWrite: () => Promise.resolve(true),
  canManage: () => Promise.resolve(true),
  canMutate: () => Promise.resolve(true),
};

describe("reactor subgraph drive node queries", () => {
  let module: InProcessReactorClientModule;
  let pg: PGlite;
  let db: Kysely<ReactorDriveDatabase>;
  let server: ReactorHttpServer;
  let unconfigured: ReactorHttpServer;
  let hostRefuses: ReactorHttpServer;

  const DRIVE = "dn-drive";
  const POLICED_DRIVE = "dn-policed-drive";
  const SECRET = "dn-secret";
  const OPEN = "dn-open";
  const DOCUMENT_TYPE =
    documentModelDocumentModelModule.documentModel.global.id;

  beforeAll(async () => {
    module = await buildReadGateReactor();
    await createFixture(module.client, DRIVE, {
      source: driveDocumentModelModule,
    });
    await createFixture(module.client, POLICED_DRIVE, {
      source: driveDocumentModelModule,
    });
    await police(module.client, POLICED_DRIVE);
    await createFixture(module.client, SECRET);
    await police(module.client, SECRET);
    await createFixture(module.client, OPEN);

    pg = new PGlite({ fs: new MemoryFS() });
    db = new Kysely<ReactorDriveDatabase>({
      dialect: new HardenedPGliteDialect(pg),
    });
    await runReactorDriveMigrations(db as unknown as Kysely<unknown>, "public");
    const folder = (
      driveId: string,
      id: string,
      parentFolder: string | null,
    ) => ({
      driveId,
      id,
      kind: "folder" as const,
      name: id,
      requestedName: id,
      parentFolder,
      documentType: null,
    });
    const file = (
      driveId: string,
      id: string,
      parentFolder: string | null,
    ) => ({
      driveId,
      id,
      kind: "file" as const,
      name: `${id}.md`,
      requestedName: `${id}.md`,
      parentFolder,
      documentType: DOCUMENT_TYPE,
    });
    await db
      .insertInto("DriveNode")
      .values([
        folder(DRIVE, "f1", null),
        folder(DRIVE, "f2", null),
        folder(DRIVE, "f3", null),
        folder(DRIVE, "f1-sub", "f1"),
        file(DRIVE, SECRET, "f1"),
        file(DRIVE, OPEN, "f1"),
        folder(POLICED_DRIVE, "pf", null),
      ])
      .execute();

    const view = new DriveNodeView(db);
    server = await startReactorHttpServer(
      module,
      openAuthorization,
      undefined,
      view,
    );
    unconfigured = await startReactorHttpServer(module, openAuthorization);
    hostRefuses = await startReactorHttpServer(
      module,
      refusingHost,
      undefined,
      view,
    );
  });

  afterAll(async () => {
    await server.close();
    await unconfigured.close();
    await hostRefuses.close();
    module.reactor.kill();
    await db.destroy();
    await pg.close();
  });

  it("lists every node when parentFolder is omitted, the root level when it is null", async () => {
    expect(ids(await list(server, { driveId: DRIVE }, READER))).toEqual(
      ["f1", "f1-sub", "f2", "f3", OPEN, SECRET].sort(),
    );
    expect(
      ids(await list(server, { driveId: DRIVE, parentFolder: null }, READER)),
    ).toEqual(["f1", "f2", "f3"]);
    expect(
      ids(await list(server, { driveId: DRIVE, parentFolder: "f1" }, READER)),
    ).toEqual(["f1-sub", OPEN, SECRET].sort());
  });

  it("filters by kind and types each node", async () => {
    const files = await list(server, { driveId: DRIVE, kind: "FILE" }, READER);
    expect(ids(files)).toEqual([OPEN, SECRET].sort());
    for (const node of files.results) {
      expect(node.__typename).toBe("DriveFileNode");
      expect(node.documentType).toBe(DOCUMENT_TYPE);
      expect(node.parentFolder).toBe("f1");
      expect(node.driveId).toBe(DRIVE);
    }
    const folders = await list(
      server,
      { driveId: DRIVE, parentFolder: null, kind: "FOLDER" },
      READER,
    );
    expect(folders.results.map((node) => node.__typename)).toEqual([
      "DriveFolderNode",
      "DriveFolderNode",
      "DriveFolderNode",
    ]);
  });

  it("pages through a listing by cursor", async () => {
    const first = await list(server, {
      driveId: DRIVE,
      parentFolder: null,
      paging: { limit: 2 },
    });
    expect(first.results).toHaveLength(2);
    expect(first.hasMore).toBe(true);
    expect(first.nextCursor).toBeTruthy();
    const second = await list(server, {
      driveId: DRIVE,
      parentFolder: null,
      paging: { limit: 2, cursor: first.nextCursor },
    });
    expect(second.results).toHaveLength(1);
    expect(second.hasMore).toBe(false);
    expect(second.nextCursor).toBeNull();
    expect([...ids(first), ...ids(second)].sort()).toEqual(["f1", "f2", "f3"]);
  });

  it("serves every node of a readable drive, as the legacy node list did, whatever the file's own policy", async () => {
    expect(
      ids(await list(server, { driveId: DRIVE, parentFolder: "f1" }, OUTSIDER)),
    ).toEqual(["f1-sub", OPEN, SECRET].sort());
    const outsider = await ask<{ driveNode: WireNode | null }>(
      server,
      NODE,
      { driveId: DRIVE, id: SECRET },
      OUTSIDER,
    );
    expect(outsider.errors).toBeUndefined();
    expect(outsider.data?.driveNode?.id).toBe(SECRET);
    const descendants = await ask<{ driveDescendants: WireNode[] }>(
      server,
      DESCENDANTS,
      { driveId: DRIVE, root: "f1" },
      OUTSIDER,
    );
    expect(ids(descendants.data!.driveDescendants)).toEqual(
      ["f1", "f1-sub", OPEN, SECRET].sort(),
    );
  });

  it("serves a policed drive's nodes only to a caller who may read it", async () => {
    for (const bearer of [undefined, OUTSIDER]) {
      const page = await list(server, { driveId: POLICED_DRIVE }, bearer);
      expect(page, String(bearer)).toEqual({
        results: [],
        nextCursor: null,
        hasMore: false,
      });
      const node = await ask<{ driveNode: WireNode | null }>(
        server,
        NODE,
        { driveId: POLICED_DRIVE, id: "pf" },
        bearer,
      );
      expect(node.data?.driveNode, String(bearer)).toBeNull();
      const descendants = await ask<{ driveDescendants: WireNode[] }>(
        server,
        DESCENDANTS,
        { driveId: POLICED_DRIVE, root: "pf" },
        bearer,
      );
      expect(descendants.data?.driveDescendants, String(bearer)).toEqual([]);
    }
    expect(ids(await list(server, { driveId: POLICED_DRIVE }, READER))).toEqual(
      ["pf"],
    );
  });

  it("applies the host's own read check on top of the read gate", async () => {
    expect(await list(hostRefuses, { driveId: DRIVE }, READER)).toEqual({
      results: [],
      nextCursor: null,
      hasMore: false,
    });
  });

  it("refuses with a clear error when no node source is configured", async () => {
    const response = await ask(unconfigured, LIST, { driveId: DRIVE }, READER);
    expect(response.errors?.[0]?.extensions?.code).toBe(
      "DRIVE_NODE_SOURCE_NOT_CONFIGURED",
    );
  });
});
