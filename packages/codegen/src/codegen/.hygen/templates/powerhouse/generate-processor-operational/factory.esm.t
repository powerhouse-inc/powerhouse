---
to: "<%= rootDir %>/<%= h.changeCase.param(name) %>/factory.ts"
force: true
---
import { type ProcessorRecord } from "document-drive/processors/types";
import { type IProcessorHostModule } from "@powerhousedao/reactor-api";
import { <%= pascalName %>Processor } from "./index.js";

export const <%= h.changeCase.camel(name) %>ProcessorFactory = (module: IProcessorHostModule) => (driveId: string): ProcessorRecord[] => {
  const processor = new <%= pascalName %>Processor();
  return [
    {
      processor,
      filter: processor.processorOptions.filter,
    },
  ];
}