import type {
  PowerhouseScalarNameV1,
  TypeReferenceDefinitionV1,
} from "@powerhousedao/shared/document-model";

export const DOCUMENT_SCALAR_REFERENCE_ORDER = [
  "PHID",
  "OID",
  "OLabel",
  "Currency",
  "EmailAddress",
  "EthereumAddress",
  "URL",
  "Date",
  "DateTime",
  "Amount_Money",
  "Amount_Percentage",
  "Amount_Tokens",
  "Amount",
  "Amount_Fiat",
  "Amount_Crypto",
  "Amount_Currency",
  "Address",
  "AttachmentRef",
  "Unknown",
  "Upload",
  "JSONObject",
] as const satisfies readonly PowerhouseScalarNameV1[];

const CUSTOM_SCALAR_NAMES = new Set<string>(DOCUMENT_SCALAR_REFERENCE_ORDER);

export function isCustomScalarName(name: string): boolean {
  return CUSTOM_SCALAR_NAMES.has(name);
}

export function scalarNamesInReference(
  type: TypeReferenceDefinitionV1,
  names: Set<string>,
): void {
  if (type.kind === "list") {
    scalarNamesInReference(type.item, names);
  } else if (type.kind === "scalar" && isCustomScalarName(type.name)) {
    names.add(type.name);
  }
}
