---
to: "<%= rootDir %>/<%= h.changeCase.param(name) %>/factory.ts"
force: true
---
import { type ProcessorRecord } from "document-drive/processors/types";
import { type IProcessorHostModule } from "document-drive/processors/types";
import { type PHDocumentHeader } from "document-model";
import { <%= pascalName %>Processor } from "./index.js";

export const <%= h.changeCase.pascal(name) %>ProcessorFactory = (module: IProcessorHostModule) => (driveHeader: PHDocumentHeader): ProcessorRecord[] => {
  return [
    {
      processor: new <%= pascalName %>Processor(module.analyticsStore),
      filter: {
        branch: ["main"],
        documentId: ["*"],
        scope: ["*"],
        documentType: [<% if(documentTypes.length) { %><%- documentTypes.map(type => `"${type}"`).join(", ") %><% } else { %>"*"<% } %>],
      },
    },
  ];
}