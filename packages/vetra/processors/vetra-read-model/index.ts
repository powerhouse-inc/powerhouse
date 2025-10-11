import {
  RelationalDbProcessor,
  type InternalTransmitterUpdate,
} from "document-drive";
import type { VetraPackageState } from "../../document-models/vetra-package/gen/schema/types.js";
import { up } from "./migrations.js";
import { type DB } from "./schema.js";

interface VetraPackageGlobalState extends VetraPackageState {}

export class VetraReadModelProcessor extends RelationalDbProcessor<DB> {
  static override getNamespace(driveId: string): string {
    // Default namespace: `${this.name}_${driveId.replaceAll("-", "_")}`
    // we keep all vetra packages in the same namespace even if they are stored in different drives
    return super.getNamespace("vetra-packages");
  }

  override async initAndUpgrade(): Promise<void> {
    await up(this.relationalDb);
  }

  override async onStrands(
    strands: InternalTransmitterUpdate[],
  ): Promise<void> {
    if (strands.length === 0) {
      return;
    }

    for (const strand of strands) {
      if (strand.operations.length === 0) {
        continue;
      }

      // Only process VetraPackage documents
      if (strand.documentType !== "powerhouse/package") {
        continue;
      }

      // Get the last operation to extract the most recent state
      const lastOperation = strand.operations[strand.operations.length - 1];
      if (!lastOperation) continue;

      // Extract VetraPackage state fields with proper typing
      const state = strand.state as VetraPackageGlobalState | undefined;

      // Helper to safely get string values
      const getString = (val: unknown): string | null =>
        typeof val === "string" ? val : null;

      const now = new Date();
      const operationTimestamp = new Date(
        parseInt(lastOperation.timestampUtcMs, 10),
      );

      await this.relationalDb
        .insertInto("vetra_package")
        .values({
          document_id: strand.documentId,
          // VetraPackage state fields
          name: getString(state?.name),
          description: getString(state?.description),
          category: getString(state?.category),
          author_name: getString(state?.author?.name),
          author_website: getString(state?.author?.website),
          keywords: state?.keywords ? JSON.stringify(state.keywords) : null,
          github_url: getString(state?.githubUrl),
          npm_url: getString(state?.npmUrl),
          // Document metadata
          last_operation_index: lastOperation.index,
          last_operation_hash: lastOperation.hash,
          last_operation_timestamp: operationTimestamp,
          drive_id: strand.driveId,
          created_at: now,
          updated_at: now,
        })
        .onConflict((oc) =>
          oc.column("document_id").doUpdateSet({
            name: getString(state?.name),
            description: getString(state?.description),
            category: getString(state?.category),
            author_name: getString(state?.author?.name),
            author_website: getString(state?.author?.website),
            keywords: state?.keywords ? JSON.stringify(state.keywords) : null,
            github_url: getString(state?.githubUrl),
            npm_url: getString(state?.npmUrl),
            last_operation_index: lastOperation.index,
            last_operation_hash: lastOperation.hash,
            last_operation_timestamp: operationTimestamp,
            updated_at: now,
          }),
        )
        .execute();
    }
  }

  async onDisconnect() {}
}
