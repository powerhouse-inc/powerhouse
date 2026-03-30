import type { ProcessorFactoryBuilder } from "@powerhousedao/reactor-browser";
import { testSwitchboardRelationalDbProcessorProcessorFactory } from "processors/test-switchboard-relational-db-processor";

export const processorFactoryBuilders: ProcessorFactoryBuilder[] = [
  testSwitchboardRelationalDbProcessorProcessorFactory,
];
