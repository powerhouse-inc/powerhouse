import { ts } from "@tmpl/core";

export const factoryBuildersTemplate = ts`
/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { ProcessorFactoryBuilder } from "@powerhousedao/reactor";

export const processorFactoryBuilders: ProcessorFactoryBuilder[] = [];
`.raw;
