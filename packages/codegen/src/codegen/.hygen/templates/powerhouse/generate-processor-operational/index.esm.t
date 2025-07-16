---
to: "<%= rootDir %>/<%= h.changeCase.param(name) %>/index.ts"
force: true
---
import { type IRelationalDb } from "document-drive/processors/types";
import { RelationalDbProcessor } from "document-drive/processors/relational-db-processor";
import { type InternalTransmitterUpdate } from "document-drive/server/listener/transmitter/internal";
<% documentTypes.forEach(type => { _%>
import type { <%= documentTypesMap[type].name %>Document } from "<%= documentTypesMap[type].importPath %>/index.js";
%><% }); _%>
<% if(documentTypes.length === 0) { %>import { type PHDocument } from "document-model";<% } %>
import { up } from "./migrations.js";
import { type DB } from "./schema.js";

type DocumentType = <% if(documentTypes.length) { %><%= documentTypes.map(type => `${documentTypesMap[type].name}Document`).join(" | ") %> <% } else { %>PHDocument<% } %>;

export class <%= pascalName %>Processor extends RelationalDbProcessor<DB> {
  static override getNamespace(driveId: string): string {
    // Default namespace: `${this.name}_${driveId.replaceAll("-", "_")}`
    return super.getNamespace(driveId);
  }

  override async initAndUpgrade(): Promise<void> {
    await up(this.relationalDb as IRelationalDb);
  }

  override async onStrands(
    strands: InternalTransmitterUpdate<DocumentType>[],
  ): Promise<void> {
    if (strands.length === 0) {
      return;
    }

    for (const strand of strands) {
      if (strand.operations.length === 0) {
        continue;
      }

      for (const operation of strand.operations) {
        await this.relationalDb
          .insertInto("todo")
          .values({
            task: strand.documentId,
            status: true,
          })
          .execute();
      }
    }
  }

  async onDisconnect() {}

}
