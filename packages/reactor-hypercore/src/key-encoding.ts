const PAD_WIDTH = 10;

export function pad(n: number): string {
  return n.toString().padStart(PAD_WIDTH, "0");
}

export function operationKey(
  documentId: string,
  scope: string,
  branch: string,
  index: number,
): string {
  return `op/${documentId}/${scope}/${branch}/${pad(index)}`;
}

export function operationPrefix(
  documentId: string,
  scope: string,
  branch: string,
): string {
  return `op/${documentId}/${scope}/${branch}/`;
}

export function documentPrefix(documentId: string): string {
  return `op/${documentId}/`;
}

export function ordinalKey(ordinal: number): string {
  return `ord/${pad(ordinal)}`;
}

export function ordinalPrefix(): string {
  return "ord/";
}

export function duplicateKey(
  opId: string,
  index: number,
  skip: number,
): string {
  return `dup/${opId}/${pad(index)}/${pad(skip)}`;
}

export function headKey(
  documentId: string,
  scope: string,
  branch: string,
): string {
  return `_meta/head/${documentId}/${scope}/${branch}`;
}

export function headPrefix(documentId: string): string {
  return `_meta/head/${documentId}/`;
}

export const ORDINAL_COUNTER_KEY = "_meta/ordinal";

export type ParsedOperationKey = {
  documentId: string;
  scope: string;
  branch: string;
  index: number;
};

export function parseOperationKey(key: string): ParsedOperationKey {
  const parts = key.split("/");
  return {
    documentId: parts[1],
    scope: parts[2],
    branch: parts[3],
    index: parseInt(parts[4], 10),
  };
}

export type ParsedOrdinalEntry = {
  documentId: string;
  scope: string;
  branch: string;
  index: number;
};

export type OrdinalEntry = ParsedOrdinalEntry;
