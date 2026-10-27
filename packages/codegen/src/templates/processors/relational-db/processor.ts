import { ts } from "@tmpl/core";

const defaultNamespaceComment =
  '// Default namespace: `${this.name}_${driveId.replaceAll("-", "_")}`';
export const relationalDbProcessorTemplate = (v: { pascalCaseName: string }) =>
  ts`
import { RelationalDbProcessor } from "@powerhousedao/reactor-browser";
import type { OperationWithContext } from "document-model";
import { up } from "./migrations.js";
import type { DB } from "./schema.js";

export class ${v.pascalCaseName} extends RelationalDbProcessor<DB> {
  async onOperations(operations: OperationWithContext[]): Promise<void> {
    for (const { operation, context } of operations) {
      // DELETE_DOCUMENT and PURGE_DOCUMENT alike: erase what the document left.
      if (
        operation.action.type === "DELETE_DOCUMENT" ||
        operation.action.type === "PURGE_DOCUMENT"
      ) {
        const input = operation.action.input as { documentId?: string };
        const documentId = input.documentId ?? context.documentId;
        if (this.isNamespaceDrive(documentId)) {
          await this.dropNamespace();
          return;
        }
        await this.deleteDocumentRows(documentId);
        continue;
      }
      // CREATE_DOCUMENT, in scope "document", comes before any global
      // operation: a document that was only created still gets its row.
      if (
        operation.action.type !== "CREATE_DOCUMENT" &&
        context.scope !== "global"
      ) {
        continue;
      }
      // Write this operation's rows here, keyed by context.documentId.
      await this.relationalDb
        .insertInto("documents")
        .values({
          document_id: context.documentId,
          document_type: context.documentType,
          updated_at: operation.timestampUtcMs,
        })
        .onConflict((oc) =>
          oc
            .column("document_id")
            .doUpdateSet({ updated_at: operation.timestampUtcMs }),
        )
        .execute();
    }
  }

  onDisconnect(): Promise<void> {
    return Promise.resolve();
  }

  static override getNamespace(driveId: string): string {
    ${defaultNamespaceComment}
    return super.getNamespace(driveId);
  }

  override async initAndUpgrade(): Promise<void> {
    await up(this.relationalDb);
  }
}
`.raw;
