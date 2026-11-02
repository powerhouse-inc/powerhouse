import {
  isScalarDefinition,
  type ScalarDefinition,
  scalarDefinitionVersion,
} from "document-model/scalars";

export type ScalarExport =
  | { readonly exportName: string; readonly definition: ScalarDefinition }
  | { readonly exportName: string; readonly unsupportedVersion: unknown };

export function scalarExportsOf(
  namespace: Readonly<Record<string, unknown>>,
): ScalarExport[] {
  return Object.entries(namespace).flatMap(
    ([exportName, value]): ScalarExport[] => {
      if (isScalarDefinition(value)) return [{ exportName, definition: value }];
      const version = scalarDefinitionVersion(value);
      return version === undefined
        ? []
        : [{ exportName, unsupportedVersion: version }];
    },
  );
}
