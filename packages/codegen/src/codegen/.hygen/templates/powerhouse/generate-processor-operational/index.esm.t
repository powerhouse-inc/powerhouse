---
to: "<%= rootDir %>/<%= h.changeCase.param(name) %>/src/index.ts"
force: true
---
import { generateId } from "document-model/utils";
import {
  OperationalProcessor,
  ProcessorOptions,
  ProcessorSetupArgs,
  ProcessorUpdate,
} from "@powerhousedao/reactor-api";
<% documentTypes.forEach(type => { _%>
import { <%= documentTypesMap[type].name %>Document } from "<%= documentTypesMap[type].importPath %>";
%><% }); _%>
<% if(documentTypes.length === 0) { %>import { Document } from "document-model/document";<% } %>
type DocumentType = <% if(documentTypes.length) { %><%= documentTypes.map(type => `${documentTypesMap[type].name}Document`).join(" | ") %> <% } else { %>Document<% } %>;

export class <%= pascalName %>Processor extends OperationalProcessor<% if(documentTypes.length) { %><DocumentType><% } %> {

  protected processorOptions: ProcessorOptions = {
    listenerId: generateId(),
    filter: {
      branch: ["main"],
      documentId: ["*"],
      documentType: [<% if(documentTypes.length) { %><%- documentTypes.map(type => `"${type}"`).join(", ") %><% } else { %>"*"<% }   %>],
      scope: ["global"],
    },
    block: false,
    label: "<%= name %>",
    system: true,
  };

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

  async onSetup(args: ProcessorSetupArgs) {
    await super.onSetup(args);
    await this.operationalStore.schema.createTable("index_search_op", (table) => {
      table.increments("id").primary();
      table.string("documentId").notNullable();
    });
  }

  async onDisconnect() {}

}
