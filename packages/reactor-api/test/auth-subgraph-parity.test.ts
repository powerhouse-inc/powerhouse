import { createRequire } from "node:module";
import type * as GraphQL from "graphql";
import { describe, expect, it } from "vitest";
import { AuthSubgraph } from "../src/graphql/auth/subgraph.js";
import { describeSubgraphClass } from "../src/graphql/hosted-subgraph.js";
import type { Context, SubgraphArgs } from "../src/graphql/types.js";
import { createSchema } from "../src/utils/create-schema.js";
import { AuthSubgraph as SchemaGraphqlAuthSubgraph } from "./fixtures/u8-auth/auth-subgraph.js";
import { resolversOf, typeDefsOf } from "./utils/served-subgraph.js";

// The CommonJS build @apollo/subgraph uses; vite would hand this file the ESM one.
const { graphql } = createRequire(import.meta.url)("graphql") as typeof GraphQL;

const ADMIN = "0xadmin";
const OUTSIDER = "0xoutsider";
const CREATED = new Date("2026-01-02T03:04:05.678Z");
const UPDATED = new Date("2026-02-03T04:05:06.789Z");

type Call = { method: string; args: unknown[] };

function permissionService(calls: Call[]) {
  const entry = (documentId: string, userAddress: string) => ({
    documentId,
    userAddress,
    permission: "READ",
    grantedBy: ADMIN,
    createdAt: CREATED,
    updatedAt: UPDATED,
  });
  const operationEntry = (
    documentId: string,
    operationType: string,
    userAddress: string,
  ) => ({
    documentId,
    operationType,
    userAddress,
    grantedBy: ADMIN,
    createdAt: CREATED,
  });
  const service = {
    getDocumentPermissions: (id: string) => [entry(id, "0xreader")],
    getUserDocuments: (address: string) => [entry("doc-1", address)],
    grantPermission: (id: string, address: string, permission: string) => ({
      ...entry(id, address),
      permission,
    }),
    revokePermission: () => undefined,
    getOperationUserPermissions: (id: string, operationType: string) => [
      operationEntry(id, operationType, "0xreader"),
    ],
    grantOperationPermission: (
      id: string,
      operationType: string,
      address: string,
    ) => operationEntry(id, operationType, address),
    revokeOperationPermission: () => undefined,
    getDocumentProtection: (id: string) => ({
      documentId: id,
      protected: true,
      ownerAddress: ADMIN,
    }),
    setDocumentProtection: () => undefined,
    getDocumentOwner: () => ADMIN,
    setDocumentOwner: () => undefined,
  };
  return Object.fromEntries(
    Object.entries(service).map(([method, run]) => [
      method,
      (...args: unknown[]) => {
        calls.push({ method, args });
        return Promise.resolve((run as (...a: unknown[]) => unknown)(...args));
      },
    ]),
  );
}

const authorizationService = {
  config: { admins: [], policy: "DOCUMENT_PERMISSIONS" },
  isSupremeAdmin: () => false,
  canManage: (_id: string, address?: string) =>
    Promise.resolve(address === ADMIN),
  canMutate: (_id: string, _operation: string, address?: string) =>
    Promise.resolve(address === ADMIN),
};

const reactorClient = {
  resolveIdOrSlug: (identifier: string) =>
    identifier === "missing"
      ? Promise.reject(new Error("not found"))
      : Promise.resolve(identifier),
};

type AuthClass = typeof AuthSubgraph | typeof SchemaGraphqlAuthSubgraph;

async function run(
  subgraphClass: AuthClass,
  source: string,
  caller: string | undefined,
  options: { permissions: boolean } = { permissions: true },
) {
  const calls: Call[] = [];
  const subgraph = new subgraphClass({
    reactorClient,
    authorizationService,
    ...(options.permissions && {
      documentPermissionService: permissionService(calls),
    }),
  } as unknown as SubgraphArgs);
  const schema = createSchema([], resolversOf(subgraph), typeDefsOf(subgraph));
  const result = await graphql({
    schema,
    source,
    contextValue: {
      headers: {},
      db: null,
      ...(caller !== undefined && { user: { address: caller } }),
    } as unknown as Context,
  });
  return { body: JSON.parse(JSON.stringify(result)) as unknown, calls };
}

const doc = 'documentIdOrSlug: "doc-1"';
const entryFields =
  "documentId userAddress permission grantedBy createdAt updatedAt";
const operationFields =
  "documentId operationType userAddress grantedBy createdAt";
const protectionFields = "documentId protected ownerAddress";

const OPERATIONS: Record<string, string> = {
  documentAccess: `{ documentAccess(${doc}) { documentId permissions { ${entryFields} } } }`,
  documentAccessByDeprecatedId: `{ documentAccess(documentId: "doc-1") { documentId } }`,
  documentAccessBothNames: `{ documentAccess(${doc} documentId: "doc-1") { documentId } }`,
  documentAccessNeitherName: `{ documentAccess { documentId } }`,
  documentAccessMissing: `{ documentAccess(documentIdOrSlug: "missing") { documentId } }`,
  documentProtection: `{ documentProtection(${doc}) { ${protectionFields} } }`,
  userDocumentPermissions: `{ userDocumentPermissions { ${entryFields} } }`,
  operationPermissions: `{ operationPermissions(${doc} operationType: "SET_NAME") { documentId operationType userPermissions { ${operationFields} } } }`,
  canExecuteOperation: `{ canExecuteOperation(${doc} operationType: "SET_NAME") }`,
  setDocumentProtection: `mutation { setDocumentProtection(${doc} protected: false) { ${protectionFields} } }`,
  transferDocumentOwnership: `mutation { transferDocumentOwnership(${doc} newOwnerAddress: "0xnew") { ${protectionFields} } }`,
  grantDocumentPermission: `mutation { grantDocumentPermission(${doc} userAddress: "0xnew" permission: WRITE) { ${entryFields} } }`,
  revokeDocumentPermission: `mutation { revokeDocumentPermission(${doc} userAddress: "0xreader") }`,
  grantOperationPermission: `mutation { grantOperationPermission(${doc} operationType: "SET_NAME" userAddress: "0xnew") { ${operationFields} } }`,
  revokeOperationPermission: `mutation { revokeOperationPermission(${doc} operationType: "SET_NAME" userAddress: "0xreader") }`,
};

const CALLERS = { admin: ADMIN, outsider: OUTSIDER, anonymous: undefined };

describe("the typed auth subgraph against its schema.graphql version", () => {
  it("compares a typed class with a schema.graphql class", () => {
    const kinds = [AuthSubgraph, SchemaGraphqlAuthSubgraph].map(
      (subgraphClass) =>
        describeSubgraphClass(subgraphClass)?.description.definition.schemaKind,
    );
    expect(kinds).toEqual(["typed", "graphql-ast-compat"]);
  });

  for (const [callerName, caller] of Object.entries(CALLERS)) {
    describe(`as ${callerName}`, () => {
      it.each(Object.entries(OPERATIONS))(
        "answers %s with the same body and service calls",
        async (_name, source) => {
          const typed = await run(AuthSubgraph, source, caller);
          const before = await run(SchemaGraphqlAuthSubgraph, source, caller);
          expect(typed).toEqual(before);
        },
      );
    });
  }

  it.each(Object.entries(OPERATIONS))(
    "answers %s the same on a host without document permissions",
    async (_name, source) => {
      const options = { permissions: false };
      expect(await run(AuthSubgraph, source, ADMIN, options)).toEqual(
        await run(SchemaGraphqlAuthSubgraph, source, ADMIN, options),
      );
    },
  );

  it("serves an authorized caller's grants with DateTime values", async () => {
    const { body } = await run(AuthSubgraph, OPERATIONS.documentAccess, ADMIN);
    expect(body).toEqual({
      data: {
        documentAccess: {
          documentId: "doc-1",
          permissions: [
            {
              documentId: "doc-1",
              userAddress: "0xreader",
              permission: "READ",
              grantedBy: ADMIN,
              createdAt: "2026-01-02T03:04:05.678Z",
              updatedAt: "2026-02-03T04:05:06.789Z",
            },
          ],
        },
      },
    });
  });

  it("refuses an unauthorized caller before touching the store", async () => {
    const { body, calls } = await run(
      AuthSubgraph,
      OPERATIONS.grantDocumentPermission,
      OUTSIDER,
    );
    expect(body).toEqual({
      errors: [
        {
          message:
            "Forbidden: You must be an admin of this document to grant permissions",
          locations: [{ line: 1, column: 12 }],
          path: ["grantDocumentPermission"],
        },
      ],
      data: null,
    });
    expect(calls).toEqual([]);
  });
});
