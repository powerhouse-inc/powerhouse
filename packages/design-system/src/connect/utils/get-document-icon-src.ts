import { DEFAULT, documentTypes } from "../constants/documents.js";
import { iconMap } from "../constants/icons.js";
import type { TDocumentType } from "@powerhousedao/design-system";

export function getDocumentIconSrc(
  documentType: TDocumentType,
  customDocumentIconSrc?: string,
) {
  if (customDocumentIconSrc) {
    return customDocumentIconSrc;
  }

  if (documentTypes.includes(documentType as (typeof documentTypes)[number])) {
    return iconMap[documentType];
  }

  return iconMap[DEFAULT];
}
