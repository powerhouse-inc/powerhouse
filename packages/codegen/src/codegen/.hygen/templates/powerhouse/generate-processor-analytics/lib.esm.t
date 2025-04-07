---
to: "<%= rootDir %>/index.ts"
unless_exists: true
---
/**
* This is a scaffold file meant for customization.
* Delete the file and run the code generator again to have it reset
*/

import { ProcessorFactory, ReactorModule, ProcessorRecord } from "@powerhousedao/reactor-api";
import { <%= pascalName %>Processor } from "./<%= h.changeCase.param(name)  %>/index.js";

export const processorFactory: ProcessorFactory = (driveId: string, module: ReactorModule):ProcessorRecord[] => {
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
