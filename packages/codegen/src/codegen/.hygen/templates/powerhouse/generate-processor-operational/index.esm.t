---
to: "<%= rootDir %>/<%= h.changeCase.param(name) %>/index.ts"
force: true
---
import { generateId } from "document-model";
import type {
  ProcessorOptions,
  ProcessorSetupArgs,
  ProcessorUpdate,
} from "@powerhousedao/reactor-api";
<% documentTypes.forEach(type => { _%>
import type { <%= documentTypesMap[type].name %>Document } from "<%= documentTypesMap[type].importPath %>/index.js";
import { OperationalProcessor } from "document-drive/processors/operational-processor.js";
%><% }); _%>
<% if(documentTypes.length === 0) { %>import { PHDocument } from "document-model";<% } %>
type DocumentType = <% if(documentTypes.length) { %><%= documentTypes.map(type => `${documentTypesMap[type].name}Document`).join(" | ") %> <% } else { %>PHDocument<% } %>;

export class <%= pascalName %>Processor extends OperationalProcessor<% if(documentTypes.length) { %><DocumentType><% } %> {

  async initAndUpgrade(): Promise<void> {
    await this.operationalStore.schema
      .createTable("index_search_op")
      .column("id", "integer", { primaryKey: true, autoIncrement: true })
      .column("documentId", "text", { notNullable: true })
      .ifNotExists()
      .execute();
  }

  async onStrands(strands: ProcessorUpdate<DocumentType>[]): Promise<void> {
    if (strands.length === 0) {
      return;
    }

    for (const strand of strands) {
      if (strand.operations.length === 0) {
        continue;
      }

      for (const operation of strand.operations) {
        console.log(">>> ", operation.type);
        await this.operationalStore("index_search_op").insert({
          documentId: strand.documentId,
        });
      }
    }
  }

  async onDisconnect() {}

}
