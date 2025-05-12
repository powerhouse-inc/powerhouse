---
to: "<%= rootDir %>/index.ts"
unless_exists: true
---
/**
* This is a scaffold file meant for customization.
* Delete the file and run the code generator again to have it reset
*/

import { type ProcessorRecord } from "document-drive/processors/types";
import { type IProcessorHostModule } from "@powerhousedao/reactor-api";
import { <%= pascalName %>Processor } from "./<%= h.changeCase.param(name)  %>/index.js";

export const processorFactory = (module: IProcessorHostModule) => (driveId: string):ProcessorRecord[] => {
  return [
    {
      processor: new <%= pascalName %>Processor(module.analyticsStore),
      filter: {
        branch: ["main"],
        documentId: ["*"],
        scope: ["*"],
        documentType: ["*"],
      },
    },
  ];
}
