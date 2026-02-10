import { ts } from "@tmpl/core";
import { getDocumentType } from "../utils.js";

export const analyticsFactoryTemplate = (v: {
  pascalCaseName: string;
  camelCaseName: string;
  documentTypes: string[];
}) =>
  ts`
import type { 
  ProcessorRecord, 
  IProcessorHostModule
} from "@powerhousedao/reactor";
import { type PHDocumentHeader } from "document-model";
import type { ProcessorApp } from "@powerhousedao/common";
import { ${v.pascalCaseName}Processor } from "./index.js";

export const ${v.camelCaseName}ProcessorFactory = (module: IProcessorHostModule) => (driveHeader: PHDocumentHeader, processorApp?: ProcessorApp): ProcessorRecord[] => {
  return [
    {
      processor: new ${v.pascalCaseName}Processor(module.analyticsStore),
      filter: {
        branch: ["main"],
        documentId: ["*"],
        scope: ["*"],
        documentType: [${getDocumentType(v.documentTypes)}],
      },
    },
  ];
}
`.raw;
