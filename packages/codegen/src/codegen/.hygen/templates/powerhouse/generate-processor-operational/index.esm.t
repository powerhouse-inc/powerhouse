---
to: "<%= rootDir %>/<%= h.changeCase.param(name) %>/index.ts"
force: true
---
import { BaseOperationalProcessor } from "document-drive/processors/operational-processor";
import { type InternalTransmitterUpdate } from "document-drive/server/listener/transmitter/internal";
<% documentTypes.forEach(type => { _%>
import type { <%= documentTypesMap[type].name %>Document } from "<%= documentTypesMap[type].importPath %>/index.js";
%><% }); _%>
<% if(documentTypes.length === 0) { %>import { PHDocument } from "document-model";<% } %>
type DocumentType = <% if(documentTypes.length) { %><%= documentTypes.map(type => `${documentTypesMap[type].name}Document`).join(" | ") %> <% } else { %>PHDocument<% } %>;

export class <%= pascalName %>Processor extends BaseOperationalProcessor<% if(documentTypes.length) { %><DocumentType><% } %> {

  async initAndUpgrade(): Promise<void> {
    await this.operationalStore.schema
      .createTable("todo") // TODO
      .addColumn("id", "varchar")
      .ifNotExists()
      .execute();
  }

  async onStrands(
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
        console.log(">>> ", operation.type);
        await this.operationalStore
          .insertInto("todo")
          .values({
            id: strand.documentId,
          })
          .execute();
      }
    }
  }

  async onDisconnect() {}

}
