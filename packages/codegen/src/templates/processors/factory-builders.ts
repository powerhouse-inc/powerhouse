import { ts } from "@tmpl/core";

export const factoryBuildersTemplate = ts`
import type { ProcessorFactoryBuilder } from "@powerhousedao/reactor";

export const processorFactoryBuilders: ProcessorFactoryBuilder[] = [];
`.raw;
