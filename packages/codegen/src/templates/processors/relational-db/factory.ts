import { ts } from "@tmpl/core";
import { getDocumentType } from "../utils.js";

export const relationalDbFactoryTemplate = (v: {
  camelCaseName: string;
  pascalCaseName: string;
  documentTypes: string[];
}) =>
  ts`
import type { 
  ProcessorRecord,
  IProcessorHostModule,
  ProcessorFilter
 } from "@powerhousedao/reactor"
import type { PHDocumentHeader } from "document-model";
import type { ProcessorApp } from "@powerhousedao/common";
import { ${v.pascalCaseName}Processor } from "./index.js";

export const ${v.camelCaseName}ProcessorFactory = (module: IProcessorHostModule) => async (driveHeader: PHDocumentHeader, processorApp?: ProcessorApp): Promise<ProcessorRecord[]> => {
  // Create a namespace for the processor and the provided drive id
  const namespace = ${v.pascalCaseName}Processor.getNamespace(driveHeader.id);

  // Create a namespaced db for the processor
  const store = await module.relationalDb.createNamespace<${v.pascalCaseName}Processor>(
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
  const processor = new ${v.pascalCaseName}Processor(namespace, filter, store);
  return [
    {
      processor,
      filter,
    },
  ];
}
`.raw;
