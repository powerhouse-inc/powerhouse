import type {
  IProcessorHostModule,
  ProcessorFactory,
  ProcessorRecord,
} from "@powerhousedao/reactor";
import type { PHDocumentHeader } from "document-model";

/**
 * This file aggregates all processor factories for the new reactor
 */

export const processorFactory = async (module: IProcessorHostModule) => {
  console.log({ module });
  // Initialize all processor factories once with the module
  const factories: Array<ProcessorFactory> = [];

  if (module.processorApp === "connect") {
    // dynamically import connect processors and add them
    // to the factories array
    await addConnectProcessorFactories(factories, module);
  }

  if (module.processorApp === "switchboard") {
    // dynamically import switchboard processors and add them
    // to the factories array
    await addSwitchboardProcessorFactories(factories, module);
  }

  // Return the inner function that will be called for each drive
  return async (driveHeader: PHDocumentHeader) => {
    const processors: ProcessorRecord[] = [];

    // Call each cached factory with the driveHeader
    for (const factory of factories) {
      processors.push(...(await factory(driveHeader, module.processorApp)));
    }

    return processors;
  };
};

async function addConnectProcessorFactories(
  factories: ProcessorFactory[],
  module: IProcessorHostModule,
) {
  const { vetraReadModelProcessorFactory } = await import(
    "./vetra-read-model/factory.js"
  );
  const connectProcessorFactories: ProcessorFactory[] = [
    vetraReadModelProcessorFactory(module),
  ];

  for (const factory of connectProcessorFactories) {
    factories.push(factory);
  }
}

async function addSwitchboardProcessorFactories(
  factories: ProcessorFactory[],
  module: IProcessorHostModule,
) {
  const { codegenProcessorFactory } = await import("./codegen/factory.js");
  const switchboardProcessorFactories: ProcessorFactory[] = [
    codegenProcessorFactory(module),
  ];

  for (const factory of switchboardProcessorFactories) {
    factories.push(factory);
  }
}
