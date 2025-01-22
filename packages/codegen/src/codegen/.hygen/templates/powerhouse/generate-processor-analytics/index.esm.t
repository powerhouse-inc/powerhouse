---
to: "<%= rootDir %>/<%= h.changeCase.param(name) %>/index.ts"
force: true
---
import { generateId } from "document-model/utils";
import {
    AnalyticsProcessor,
    ProcessorOptions,
    ProcessorUpdate,
    AnalyticsPath,
    AnalyticsSeriesInput,
  } from "@powerhousedao/reactor-api";
<% documentTypes.forEach(type => { _%>
import { <%= documentTypesMap[type].name %>Document } from "<%= documentTypesMap[type].importPath %>";
%><% }); _%>
<% if(documentTypes.length === 0) { %>import { Document } from "document-model/document";<% } %>
type DocumentType = <% if(documentTypes.length) { %><%= documentTypes.map(type => `${documentTypesMap[type].name}Document`).join(" | ") %> <% } else { %>Document<% } %>;

export class <%= pascalName %>Processor extends AnalyticsProcessor<% if(documentTypes.length) { %><DocumentType><% } %> {

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

    const analyticsInputs: AnalyticsSeriesInput[] = [];

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

    if (analyticsInputs.length > 0) {
      try {
        await this.analyticsStore.addSeriesValues(analyticsInputs);
      } catch (e) {
        console.error(`Error adding series values: ${e}`);
      }
    }
  }

  async onDisconnect() {}

  private async clearSource(source: AnalyticsPath) {
    try {
      await this.analyticsStore.clearSeriesBySource(source, true);
    } catch (e) {
      console.error(e);
    }
  }
}