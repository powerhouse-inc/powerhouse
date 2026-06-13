import type { Kysely } from "kysely";
import { beforeEach, describe, expect, it } from "vitest";
import {
  grantDocumentPermission,
  revokeDocumentPermission,
} from "../src/graphql/auth/resolvers.js";
import { runMigrations } from "../src/migrations/index.js";
import type { IAuthorizationService } from "../src/services/authorization.service.js";
import {
  AuthorizationPolicy,
  createAuthorizationService,
} from "../src/services/authorization.service.js";
import { DocumentPermissionService } from "../src/services/document-permission.service.js";
import type { DocumentPermissionDatabase } from "../src/utils/db.js";
import { getDbClient } from "../src/utils/db.js";

/**
 * Manage-permission gating for the grant/revoke resolvers after consolidation:
 * they now route through AuthorizationService.canManage, which grants
 * document owners (and supreme admins) management rights in addition to holders
 * of an explicit ADMIN grant.
 */
describe("grant/revoke resolvers route through canManage", () => {
  let db: Kysely<DocumentPermissionDatabase>;
  let permissions: DocumentPermissionService;
  let authorization: IAuthorizationService;

  beforeEach(async () => {
    const { db: dbClient } = getDbClient();
    db = dbClient as Kysely<DocumentPermissionDatabase>;
    await runMigrations(db as Kysely<unknown>);
    permissions = new DocumentPermissionService(db);
    authorization = createAuthorizationService(
      {
        admins: ["0xadmin"],
        defaultProtection: false,
        policy: AuthorizationPolicy.DOCUMENT_PERMISSIONS,
      },
      permissions,
      () => Promise.resolve([]),
    );
    await permissions.setDocumentProtection("doc-1", true);
  });

  it("lets a document owner without an ADMIN grant manage permissions", async () => {
    await permissions.setDocumentOwner("doc-1", "0xowner");

    const result = await grantDocumentPermission(
      permissions,
      authorization,
      { documentId: "doc-1", userAddress: "0xbob", permission: "READ" },
      "0xowner",
    );

    expect(result.userAddress).toBe("0xbob");
    expect(await authorization.canRead("doc-1", "0xbob")).toBe(true);
  });

  it("lets a supreme admin manage permissions", async () => {
    const result = await grantDocumentPermission(
      permissions,
      authorization,
      { documentId: "doc-1", userAddress: "0xbob", permission: "READ" },
      "0xadmin",
    );
    expect(result.userAddress).toBe("0xbob");
  });

  it("denies a caller who is neither owner, admin, nor ADMIN grantee", async () => {
    await permissions.setDocumentOwner("doc-1", "0xowner");

    await expect(
      grantDocumentPermission(
        permissions,
        authorization,
        { documentId: "doc-1", userAddress: "0xbob", permission: "READ" },
        "0xstranger",
      ),
    ).rejects.toThrow("Forbidden");
  });

  it("lets an owner revoke permissions", async () => {
    await permissions.setDocumentOwner("doc-1", "0xowner");
    await permissions.grantPermission("doc-1", "0xbob", "READ", "0xowner");

    const revoked = await revokeDocumentPermission(
      permissions,
      authorization,
      { documentId: "doc-1", userAddress: "0xbob" },
      "0xowner",
    );

    expect(revoked).toBe(true);
    expect(await authorization.canRead("doc-1", "0xbob")).toBe(false);
  });
});
