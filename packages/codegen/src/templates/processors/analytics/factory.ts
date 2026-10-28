import { ts } from "@tmpl/core";
import { renderProcessorFilter } from "../utils.js";

export const analyticsFactoryTemplate = (v: {
  pascalCaseName: string;
  camelCaseName: string;
  documentTypes: string[];
}) =>
  ts`
import type {
  IProcessorHostModule,
  ProcessorFactoryBuilder,
} from "@powerhousedao/reactor-browser";
import { ${v.pascalCaseName} } from "./processor.js";

export const ${v.camelCaseName}FactoryBuilder: ProcessorFactoryBuilder = (module: IProcessorHostModule) => async () => {
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
