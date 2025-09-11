import type { documentTypes } from "#connect";

export type DocumentTypes = typeof documentTypes;

// this weird syntax means "do autocomplete if you're using a string from our `DocumentTypes` list, but also allow any string"
export type TDocumentType = DocumentTypes[number] | (string & {});
