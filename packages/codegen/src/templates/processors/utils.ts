/** Fields of a generated processor's `ProcessorFilter`, in emission order. */
export type ProcessorFilterFields = {
  branch?: string[];
  documentId?: string[];
  documentType?: string[];
  scope?: string[];
};

const FILTER_FIELD_ORDER = [
  "branch",
  "documentId",
  "documentType",
  "scope",
] as const satisfies readonly (keyof ProcessorFilterFields)[];

/** Splits, trims and compacts one filter field, so `-t a -t b` and
 * `-t "a,b"` mean the same thing instead of the latter yielding one value. */
export function parseFilterValues(values: string[] | undefined): string[] {
  return (values ?? [])
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

/** Renders a generated factory's `ProcessorFilter`, omitting empty fields:
 * only `documentId` honours `"*"`, so `["*"]` elsewhere matches nothing. */
export function renderProcessorFilter(fields: ProcessorFilterFields): string {
  const properties = FILTER_FIELD_ORDER.map(
    (name) => [name, parseFilterValues(fields[name])] as const,
  )
    .filter(([, values]) => values.length > 0)
    .map(
      ([name, values]) =>
        `  ${name}: [${values.map((value) => `"${value}"`).join(", ")}],`,
    );

  if (properties.length === 0) return "{}";
  return `{\n${properties.join("\n")}\n}`;
}
