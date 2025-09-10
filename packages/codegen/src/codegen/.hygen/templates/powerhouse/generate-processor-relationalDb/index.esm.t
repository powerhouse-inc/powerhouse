---
to: "<%= rootDir %>/<%= h.changeCase.param(name) %>/index.ts"
unless_exists: true
---
import { type IRelationalDb } from "document-drive";
import { RelationalDbProcessor } from "document-drive";
import { type InternalTransmitterUpdate } from "document-drive";
<% documentTypes.forEach(type => { _%>
import type { <%= documentTypesMap[type].name %>Document } from "<%= documentTypesMap[type].importPath %>/index.js";
%><% }); _%>
<% if(documentTypes.length === 0) { %>import { type PHDocument } from "document-model";<% } %>
import { up } from "./migrations.js";
import { type DB } from "./schema.js";

export class <%= pascalName %>Processor extends RelationalDbProcessor<DB> {
  static override getNamespace(driveId: string): string {
    // Default namespace: `${this.name}_${driveId.replaceAll("-", "_")}`
    return super.getNamespace(driveId);
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

      for (const operation of strand.operations) {
        await this.relationalDb
          .insertInto("todo")
          .values({
            task: `${strand.documentId}-${operation.index}: ${operation.action.type}`,
            status: true,
          })
          .onConflict((oc) => oc.column("task").doNothing())
          .execute();
      }
    }
  }

  async onDisconnect() {}

}
