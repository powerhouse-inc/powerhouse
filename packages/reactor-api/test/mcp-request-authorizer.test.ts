import { MemoryKeyStorage, RenownCryptoBuilder } from "@renown/sdk/node";
import type { Kysely } from "kysely";
import type { IncomingMessage } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AuthService } from "../src/services/auth.service.js";
import {
  AuthorizationPolicy,
  createAuthorizationService,
  type CanonicalDocumentId,
} from "../src/services/authorization.service.js";
import { DocumentPermissionService } from "../src/services/document-permission.service.js";
import {
  createMcpRequestAuthorizer,
  type McpRequestAuthorizerOptions,
} from "../src/services/mcp-request-authorizer.js";
import type { DocumentPermissionDatabase } from "../src/utils/db.js";
import { openReactorPermissionStore } from "./utils/reactor-permission-store.js";

// The /mcp gate over a real AuthService (real did:key bearers) and a real
// DOCUMENT_PERMISSIONS authorization service, as GraphQL decides with them.

const ADMIN = "0x1111111111111111111111111111111111111111";
const USER = "0x2222222222222222222222222222222222222222";
const PROTECTED = "doc-protected";
const OPEN_DOC = "doc-open";
const SLUGS: Record<string, string> = { "protected-slug": PROTECTED };

const request = (authorization?: string) =>
  ({ headers: { authorization } }) as IncomingMessage;

async function bearer(address: string): Promise<string> {
  const crypto = await new RenownCryptoBuilder()
    .withKeyPairStorage(new MemoryKeyStorage())
    .build();
  return `Bearer ${await crypto.getBearerToken(address)}`;
}

// Resolves the way the reactor's resolveIdOrSlug does, over a fixed set.
async function resolveDocumentId(identifier: string) {
  const id = SLUGS[identifier] ?? identifier;
  if (![PROTECTED, OPEN_DOC].includes(id)) throw new Error("not found");
  return Promise.resolve(id as CanonicalDocumentId);
}

let db: Kysely<DocumentPermissionDatabase>;
let permissions: DocumentPermissionService;

beforeEach(async () => {
  db = await openReactorPermissionStore();
  permissions = new DocumentPermissionService(db);
  await permissions.setDocumentProtection(PROTECTED, true);
});

afterEach(async () => {
  await db.destroy();
});

const authService = () =>
  new AuthService({
    enabled: true,
    admins: [ADMIN],
    skipCredentialVerification: true,
  });

function documentPermissions(
  options: Partial<McpRequestAuthorizerOptions> = {},
) {
  return createMcpRequestAuthorizer(
    authService(),
    createAuthorizationService(
      {
        admins: [ADMIN],
        defaultProtection: true,
        policy: AuthorizationPolicy.DOCUMENT_PERMISSIONS,
      },
      permissions,
      () => Promise.resolve([]),
    ),
    {
      requireAuthenticatedCaller: false,
      resolveDocumentId,
      documentPermissionService: permissions,
      ...options,
    },
  );
}

async function admitted(
  authorize: ReturnType<typeof documentPermissions>,
  authorization?: string,
) {
  const result = await authorize(request(authorization));
  if (!result.authorized) throw new Error(`refused: ${result.status}`);
  return result;
}

describe("createMcpRequestAuthorizer", () => {
  it("admits everyone as anonymous, unrestricted, without an auth service under OPEN", async () => {
    const authorize = createMcpRequestAuthorizer(
      undefined,
      createAuthorizationService({
        admins: [],
        defaultProtection: false,
        policy: AuthorizationPolicy.OPEN,
      }),
      { requireAuthenticatedCaller: false, resolveDocumentId },
    );

    const result = await admitted(authorize);

    expect(result.subject).toEqual({});
    expect(result.access?.unrestricted).toBe(true);
    expect(await result.access?.canCreate()).toBe(true);
  });

  it("admits anonymous callers without an auth service, refused by the policy as GraphQL refuses them", async () => {
    const authorize = createMcpRequestAuthorizer(
      undefined,
      createAuthorizationService({
        admins: [ADMIN],
        defaultProtection: false,
        policy: AuthorizationPolicy.ADMIN_ONLY,
      }),
      { requireAuthenticatedCaller: false, resolveDocumentId },
    );

    const { access } = await admitted(authorize);

    expect(access?.unrestricted).toBe(false);
    expect(access?.authenticated).toBe(false);
    expect(await access?.canRead(OPEN_DOC)).toBe(false);
    expect(await access?.canCreate()).toBe(false);
  });

  it("answers a bad bearer with a 401", async () => {
    await expect(
      documentPermissions()(request("Bearer not-a-jwt")),
    ).resolves.toEqual({
      authorized: false,
      status: 401,
      message: "Authentication failed",
    });
  });

  it("admits anonymous callers unless the require-authenticated-caller floor is on", async () => {
    const { subject, access } = await admitted(documentPermissions());
    expect(subject).toEqual({});
    expect(await access?.canRead(OPEN_DOC)).toBe(true);
    expect(await access?.canRead(PROTECTED)).toBe(false);
    expect(await access?.canCreate()).toBe(false);

    await expect(
      documentPermissions({ requireAuthenticatedCaller: true })(request()),
    ).resolves.toEqual({
      authorized: false,
      status: 401,
      message: "Authentication required",
    });
  });

  it("admits a non-admin, deciding each document by its grants", async () => {
    const { subject, access } = await admitted(
      documentPermissions(),
      await bearer(USER),
    );

    expect(subject).toMatchObject({ address: USER });
    expect(subject.key).toMatch(/^did:key:/);
    expect(access?.unrestricted).toBe(false);
    expect(await access?.canRead(PROTECTED)).toBe(false);
    expect(await access?.canMutate(PROTECTED, "SET_NAME")).toBe(false);
    expect(await access?.canCreate()).toBe(true);

    await permissions.grantPermission(PROTECTED, USER, "READ", ADMIN);
    expect(await access?.canRead("protected-slug")).toBe(true);
    expect(await access?.canWrite(PROTECTED)).toBe(false);

    await permissions.grantPermission(PROTECTED, USER, "WRITE", ADMIN);
    expect(await access?.canWrite(PROTECTED)).toBe(true);
    expect(await access?.canMutate(PROTECTED, "SET_NAME")).toBe(true);
  });

  it("refuses an identifier that resolves to no document", async () => {
    const { access } = await admitted(
      documentPermissions(),
      await bearer(USER),
    );
    expect(await access?.canRead("missing")).toBe(false);
  });

  it("makes the creator the owner, as GraphQL's create mutations do", async () => {
    const { access } = await admitted(
      documentPermissions(),
      await bearer(USER),
    );

    await access?.created?.(OPEN_DOC);

    expect(await permissions.getDocumentOwner(OPEN_DOC)).toBe(USER);
    expect(await access?.canWrite(OPEN_DOC)).toBe(true);
  });

  it("gives supreme admins policy-wide access", async () => {
    const { access } = await admitted(
      documentPermissions(),
      await bearer(ADMIN),
    );
    expect(access?.unrestricted).toBe(true);
  });
});
