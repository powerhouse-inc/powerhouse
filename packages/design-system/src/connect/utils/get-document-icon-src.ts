import type { TDocumentType } from "#connect";
import { DEFAULT, documentTypes, iconMap } from "#connect";

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
