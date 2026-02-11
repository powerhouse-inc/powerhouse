import type { PROCESSOR_APPS } from "./constants.js";

export type ProcessorApp = (typeof PROCESSOR_APPS)[number];

export type ProcessorApps = readonly ProcessorApp[];
