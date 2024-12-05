---
to: "<%= rootDir %>/<%= h.changeCase.param(name) %>/src/index.ts"
force: true
---
import {
    AnalyticsProcessor,
    ProcessorOptions,
    ProcessorUpdate
  } from "@powerhousedao/reactor-api";
<% documentTypes.forEach(type => { _%>
import { <%= documentTypesMap[type].name %>Document } from "<%= documentTypesMap[type].importPath %>";
%><% }); _%>

<% if(documentTypes.length) { %>type DocumentType = <%= documentTypes.map(type => `${documentTypesMap[type].name}Document`).join(" | ") %> <% } %>;

export class RWAAnalyticsProcessor extends AnalyticsProcessor<% if(documentTypes.length) { %><DocumentType><% } %> {

    protected processorOptions: ProcessorOptions = {
        listenerId: "rwa-analytics-processor",
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

    async onStrands(
        strands: ProcessorUpdate<DocumentType>[],
    ): Promise<void> {}
    
    async onDisconnect() {}
}