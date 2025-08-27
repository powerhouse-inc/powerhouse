---
to: "<%= rootDir %>/<%= h.changeCase.param(name) %>/factory.ts"
force: true
---
import {
  type ProcessorRecord,
  type IProcessorHostModule
} from "document-drive";
import {
  type RelationalDbProcessorFilter,
} from "document-drive";
import { type PHDocumentHeader } from "document-model";
import { <%= pascalName %>Processor } from "./index.js";

export const <%= h.changeCase.camel(name) %>ProcessorFactory = (module: IProcessorHostModule) => async (driveHeader: PHDocumentHeader): Promise<ProcessorRecord[]> => {
  // Create a namespace for the processor and the provided drive id
  const namespace = <%= pascalName %>Processor.getNamespace(driveHeader.id);

  // Create a namespaced db for the processor
  const store = await module.relationalDb.createNamespace<<%= pascalName %>Processor>(
    namespace,
  );

  // Create a filter for the processor
  const filter: RelationalDbProcessorFilter = {
    branch: ["main"],
    documentId: ["*"],
    documentType: [<% if(documentTypes.length) { %><%- documentTypes.map(type => `"${type}"`).join(", ") %><% } else { %>"*"<% }   %>],
    scope: ["global"],
  };

  // Create the processor
  const processor = new <%= pascalName %>Processor(namespace, filter, store);
  return [
    {
      processor,
      filter,
    },
  ];
}