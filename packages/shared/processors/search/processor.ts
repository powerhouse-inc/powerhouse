import type { OperationWithContext } from "../../document-model/index.js";
import type { IProcessor } from "../types.js";
import type { SearchDB } from "./schema.js";
import { flattenToSearchableText } from "./utils.js";
import { sql, type Kysely } from "kysely";

export class SearchProcessor implements IProcessor {
  constructor(private readonly db: Kysely<SearchDB>) {}

  async onOperations(operations: OperationWithContext[]): Promise<void> {
    if (operations.length === 0) return;

    // Collect the last operation per documentId (earlier states are superseded)
    const lastByDocument = new Map<string, OperationWithContext>();

    for (const entry of operations) {
      const { operation, context } = entry;

      if (operation.action.type === "DELETE_DOCUMENT") {
        const input = operation.action.input as {
          documentId?: string;
        };
        const deletedId = input.documentId ?? context.documentId;
        await this.db
          .deleteFrom("search_index")
          .where("document_id", "=", deletedId)
          .execute();
        lastByDocument.delete(deletedId);
        continue;
      }

      if (!context.resultingState) continue;
      lastByDocument.set(context.documentId, entry);
    }

    for (const [documentId, { context }] of lastByDocument) {
      const state = JSON.parse(context.resultingState!) as Record<
        string,
        unknown
      >;
      const title = typeof state.name === "string" ? state.name : "";
      const content = flattenToSearchableText(state);

      await sql`
        INSERT INTO search_index (document_id, document_type, title, content, tsv, updated_at)
        VALUES (
          ${documentId},
          ${context.documentType},
          ${title},
          ${content},
          to_tsvector('english', ${content}),
          NOW()
        )
        ON CONFLICT (document_id) DO UPDATE SET
          document_type = EXCLUDED.document_type,
          title = EXCLUDED.title,
          content = EXCLUDED.content,
          tsv = EXCLUDED.tsv,
          updated_at = NOW()
      `.execute(this.db);
    }
  }

  async onDisconnect(): Promise<void> {}
}
