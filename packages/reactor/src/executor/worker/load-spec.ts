import type { DocumentModelModule } from "@powerhousedao/shared/document-model";
import type { DocumentModelSpec, FactorySpec } from "./protocol.js";

/** Imports `spec.module` and calls the export with `spec.initArgs`, or returns it if not a function. */
export async function defaultLoadFactory(spec: FactorySpec): Promise<unknown> {
  const ref = spec.module;
  const specifier =
    "filePath" in ref
      ? new URL(`file://${ref.filePath}`).href
      : ref.packageName;
  const mod = (await import(specifier)) as Record<string, unknown>;
  const exported = mod[ref.exportName];
  if (typeof exported === "function") {
    return (exported as (args: unknown) => unknown)(spec.initArgs);
  }
  return exported;
}

/** Loads the document model module a manifest entry's spec names. */
export async function loadDocumentModelSpec(
  spec: DocumentModelSpec,
): Promise<DocumentModelModule> {
  return (await defaultLoadFactory(spec)) as DocumentModelModule;
}
