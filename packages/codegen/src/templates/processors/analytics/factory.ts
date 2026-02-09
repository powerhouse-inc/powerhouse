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
  ReactorContext,
  IProcessorHostModule
} from "document-drive";
import { type PHDocumentHeader } from "document-model";
import { ${v.pascalCaseName}Processor } from "./index.js";

export const ${v.camelCaseName}ProcessorFactory = (module: IProcessorHostModule) => (driveHeader: PHDocumentHeader, context?: ReactorContext): ProcessorRecord[] => {
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
