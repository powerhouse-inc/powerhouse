/** The processor kinds Vetra's codegen can generate. */
export const PROCESSOR_TYPES = ["analytics", "relational"] as const;
export type ProcessorType = (typeof PROCESSOR_TYPES)[number];

export function isProcessorType(type: string): type is ProcessorType {
  return (PROCESSOR_TYPES as readonly string[]).includes(type);
}
