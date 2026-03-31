import { ts } from "@tmpl/core";
import { getDocumentType } from "../utils.js";

export const analyticsFactoryTemplate = (v: {
  pascalCaseName: string;
  camelCaseName: string;
  documentTypes: string[];
}) =>
  ts`
import type { 
  ProcessorApp,
  ProcessorFactoryBuilder,
  ProcessorRecord, 
  IProcessorHostModule,
} from "@powerhousedao/reactor-browser";
import { type PHDocumentHeader } from "document-model";
import { ${v.pascalCaseName} } from "./processor.js";

export const ${v.camelCaseName}FactoryBuilder: ProcessorFactoryBuilder = (module: IProcessorHostModule) => async (driveHeader: PHDocumentHeader, processorApp?: ProcessorApp) => {
  return [
    {
      processor: new ${v.pascalCaseName}(module.analyticsStore),
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
