---
to: "<%= rootDir %>/<%= h.changeCase.param(name) %>/factory.ts"
force: true
---
import {
  type ProcessorRecord,
  type IProcessorHostModule
} from "document-drive/processors/types";
import {
  type RelationalDbProcessorFilter,
} from "document-drive/processors/relational";
import { <%= pascalName %>Processor } from "./index.js";

export const <%= h.changeCase.camel(name) %>ProcessorFactory = (module: IProcessorHostModule) => async (driveId: string): Promise<ProcessorRecord[]> => {
  // Create a namespace for the processor and the provided drive id
  const namespace = <%= pascalName %>Processor.getNamespace(driveId);

   // Create a filter for the processor
   const filter: RelationalDbProcessorFilter = {
    branch: ["main"],
    documentId: ["*"],
    documentType: [<% if(documentTypes.length) { %><%- documentTypes.map(type => `"${type}"`).join(", ") %><% } else { %>"*"<% }   %>],
    scope: ["global"],
  };

  // Create a namespaced db for the processor
  const store = await module.relationalDb.createNamespacedDb<<%= pascalName %>Processor>(
    namespace,
  );

  // Create the processor
  const processor = new <%= pascalName %>Processor(namespace, filter, store);
  return [
    {
      processor,
      filter,
    },
  ];
}