---
to: "<%= rootDir %>/<%= h.changeCase.param(name) %>/index.ts"
force: true
---
import { OperationalProcessor, type OperationalProcessorFilter } from "document-drive/processors/operational-processor";
import { type InternalTransmitterUpdate } from "document-drive/server/listener/transmitter/internal";
import { up } from "./migrations.js";
import { type DB } from "./schema.js";
<% documentTypes.forEach(type => { _%>
import type { <%= documentTypesMap[type].name %>Document } from "<%= documentTypesMap[type].importPath %>/index.js";
%><% }); _%>
<% if(documentTypes.length === 0) { %>import { type PHDocument } from "document-model";<% } %>
type DocumentType = <% if(documentTypes.length) { %><%= documentTypes.map(type => `${documentTypesMap[type].name}Document`).join(" | ") %> <% } else { %>PHDocument<% } %>;

export class <%= pascalName %>Processor extends OperationalProcessor<DB> {

  get filter(): OperationalProcessorFilter {
    return {
      branch: ["main"],
      documentId: ["*"],
      documentType: [<% if(documentTypes.length) { %><%- documentTypes.map(type => `"${type}"`).join(", ") %><% } else { %>"*"<% }   %>],
      scope: ["global"],
    }
  }

  async initAndUpgrade(): Promise<void> {
    await up(this.operationalStore);
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
            task: strand.documentId,
            status: true,
          })
          .execute();
      }
    }
  }

  async onDisconnect() {}

}
