import type { DocumentPermissionService } from "./document-permission.service.js";

/** One permission row naming an address, as reactor-privacy discloses it. */
export type PrivacyPermissionRow = {
  table: string;
  column: string;
  documentId: string | null;
  detail?: Record<string, unknown>;
};

/**
 * reactor-privacy's permission lookup and eraser, over this host's
 * DocumentPermissionService. Typed structurally on the privacy side.
 */
export class PrivacyPermissionAdapter {
  constructor(private readonly service: DocumentPermissionService) {}

  async rowsForAddress(address: string): Promise<PrivacyPermissionRow[]> {
    const lower = address.toLowerCase();
    const found = await this.service.rowsForAddress(address);
    const rows: PrivacyPermissionRow[] = [];
    for (const row of found.permissions) {
      for (const column of ["userAddress", "grantedBy"] as const) {
        if (row[column] !== lower) continue;
        rows.push({
          table: "DocumentPermission",
          column,
          documentId: row.documentId,
          detail: { permission: row.permission },
        });
      }
    }
    for (const row of found.operationPermissions) {
      for (const column of ["userAddress", "grantedBy"] as const) {
        if (row[column] !== lower) continue;
        rows.push({
          table: "OperationUserPermission",
          column,
          documentId: row.documentId,
          detail: { operationType: row.operationType },
        });
      }
    }
    for (const documentId of found.ownedDocumentIds) {
      rows.push({
        table: "DocumentProtection",
        column: "ownerAddress",
        documentId,
      });
    }
    return rows;
  }

  async erasePermissions(documentId: string): Promise<Record<string, number>> {
    const permissions =
      await this.service.deleteAllDocumentPermissions(documentId);
    const protection = await this.service.deleteDocumentProtection(documentId);
    return { ...permissions, DocumentProtection: protection };
  }
}
