import { ts } from "@tmpl/core";
import { getDocumentType } from "../utils.js";

export const relationalDbFactoryTemplate = (v: {
  camelCaseName: string;
  pascalCaseName: string;
  documentTypes: string[];
}) =>
  ts`
import type { 
  IProcessorHostModule,
  ProcessorApp,
  ProcessorFactoryBuilder,
  ProcessorFilter,
  ProcessorRecord,
 } from "@powerhousedao/reactor-browser"
import type { PHDocumentHeader } from "document-model";
import { ${v.pascalCaseName} } from "./processor.js";

export const ${v.camelCaseName}FactoryBuilder: ProcessorFactoryBuilder = (module: IProcessorHostModule) => async (driveHeader: PHDocumentHeader, processorApp?: ProcessorApp) => {
  // Create a namespace for the processor and the provided drive id
  const namespace = ${v.pascalCaseName}.getNamespace(driveHeader.id);

  // Create a namespaced db for the processor
  const store = await module.relationalDb.createNamespace<${v.pascalCaseName}>(
    namespace,
  );

  // Create a filter for the processor
  const filter: ProcessorFilter = {
    branch: ["main"],
    documentId: ["*"],
    documentType: [${getDocumentType(v.documentTypes)}],
    scope: ["global"],
  };

  // Create the processor
  const processor = new ${v.pascalCaseName}(namespace, filter, store);
  return [
    {
      processor,
      filter,
    },
  ];
}
`.raw;
