---
to: "<%= rootDir %>/<%= h.changeCase.param(name) %>/src/index.ts"
force: true
---
import { generateId } from "document-model/utils";
import {
    AnalyticsProcessor,
    ProcessorOptions,
    ProcessorUpdate,
    AnalyticsPath
  } from "@powerhousedao/reactor-api";
<% documentTypes.forEach(type => { _%>
import { <%= documentTypesMap[type].name %>Document } from "<%= documentTypesMap[type].importPath %>";
%><% }); _%>

<% if(documentTypes.length) { %>type DocumentType = <%= documentTypes.map(type => `${documentTypesMap[type].name}Document`).join(" | ") %> <% } %>;

export class <%= pascalName %>Processor extends AnalyticsProcessor<% if(documentTypes.length) { %><DocumentType><% } %> {

    protected processorOptions: ProcessorOptions = {
    listenerId: generateId(),
    filter: {
      branch: ["main"],
      documentId: ["*"],
      documentType: [<%- documentTypes.map(type => `"${type}"`).join(", ") %>],
      scope: ["global"],
    },
    block: false,
    label: "rwa-analytics-processor",
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

      const firstOp = strand.operations[0];
      const source = AnalyticsPath.fromString(
        `ph/${strand.driveId}/${strand.documentId}/${strand.branch}/${strand.scope}`,
      );
      if (firstOp.index === 0) {
        await this.clearSource(source);
      }

      for (const operation of strand.operations) {
        console.log(">>> ", operation.type);
      }
    }
  }

  async onDisconnect() {}

  private async clearSource(source: AnalyticsPath) {
    await this.analyticsStore.clearSeriesBySource(source, true);
  }
}