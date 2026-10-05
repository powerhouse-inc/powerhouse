import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "../src/migrations/index.js";
import { DocumentPermissionService } from "../src/services/document-permission.service.js";
import { PrivacyPermissionAdapter } from "../src/services/privacy-permissions.js";
import type { DocumentPermissionDatabase } from "../src/utils/db.js";
import { getDbClient } from "../src/utils/db.js";

const SUBJECT = "0xAbCd00000000000000000000000000000000aBcD";
const ADMIN = "0xadad00000000000000000000000000000000adad";

describe("PrivacyPermissionAdapter", () => {
  let db: Kysely<DocumentPermissionDatabase>;
  let service: DocumentPermissionService;
  let adapter: PrivacyPermissionAdapter;

  beforeEach(async () => {
    db = getDbClient().db as Kysely<DocumentPermissionDatabase>;
    await runMigrations(db as Kysely<unknown>);
    service = new DocumentPermissionService(db);
    adapter = new PrivacyPermissionAdapter(service);

    await service.grantPermission("doc-1", SUBJECT, "WRITE", ADMIN);
    await service.grantPermission("doc-2", ADMIN, "READ", SUBJECT);
    await service.grantOperationPermission("doc-1", "SET_NAME", SUBJECT, ADMIN);
    await service.setDocumentOwner("doc-1", SUBJECT);
    await service.grantPermission("doc-3", ADMIN, "ADMIN", ADMIN);
  });

  afterEach(async () => {
    await db.destroy();
  });

  it("lists every row naming the address, case-insensitively", async () => {
    expect(
      await adapter.rowsForAddress(SUBJECT.toUpperCase().replace("0X", "0x")),
    ).toEqual([
      {
        table: "DocumentPermission",
        column: "userAddress",
        documentId: "doc-1",
        detail: { permission: "WRITE" },
      },
      {
        table: "DocumentPermission",
        column: "grantedBy",
        documentId: "doc-2",
        detail: { permission: "READ" },
      },
      {
        table: "OperationUserPermission",
        column: "userAddress",
        documentId: "doc-1",
        detail: { operationType: "SET_NAME" },
      },
      {
        table: "DocumentProtection",
        column: "ownerAddress",
        documentId: "doc-1",
      },
    ]);
  });

  it("erases a document's permission, operation and protection rows", async () => {
    expect(await adapter.erasePermissions("doc-1")).toEqual({
      DocumentPermission: 1,
      OperationUserPermission: 1,
      DocumentProtection: 1,
    });
    expect(await service.getDocumentOwner("doc-1")).toBeNull();
    expect(
      (await adapter.rowsForAddress(SUBJECT)).map((row) => row.documentId),
    ).toEqual(["doc-2"]);
    expect(await adapter.erasePermissions("doc-1")).toEqual({
      DocumentPermission: 0,
      OperationUserPermission: 0,
      DocumentProtection: 0,
    });
    expect(await service.getUserPermission("doc-3", ADMIN)).toBe("ADMIN");
  });
});
