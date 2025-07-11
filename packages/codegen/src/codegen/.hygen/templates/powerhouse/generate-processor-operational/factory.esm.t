---
to: "<%= rootDir %>/<%= h.changeCase.param(name) %>/factory.ts"
force: true
---
import { type ProcessorRecord } from "document-drive/processors/types";
import { type IProcessorHostModule } from "document-drive/processors/types";
import { <%= pascalName %>Processor } from "./index.js";

export const <%= h.changeCase.camel(name) %>ProcessorFactory = (module: IProcessorHostModule) => async (driveId: string): Promise<ProcessorRecord[]> => {
  const processor = await <%= pascalName %>Processor.build(driveId, module.operationalStore);
  return [
    {
      processor,
      filter: processor.filter,
    },
  ];
}