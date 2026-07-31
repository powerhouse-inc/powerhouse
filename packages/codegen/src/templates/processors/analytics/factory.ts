import { ts } from "@tmpl/core";
import { renderProcessorFilter } from "../utils.js";

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
      // An omitted field matches every value. Only \`documentId\` honours "*".
      filter: ${renderProcessorFilter({
        branch: ["main"],
        documentId: ["*"],
        documentType: v.documentTypes,
      })},
    },
  ];
}
`.raw;
