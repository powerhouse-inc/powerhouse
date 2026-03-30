import type { ProcessorFactoryBuilder } from "@powerhousedao/reactor-browser";
import { testConnectAnalyticsProcessorProcessorFactory } from "processors/test-connect-analytics-processor";

export const processorFactoryBuilders: ProcessorFactoryBuilder[] = [
  testConnectAnalyticsProcessorProcessorFactory,
];
