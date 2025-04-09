import { DEFAULT, documentTypes, iconMap, type TDocumentType } from "#connect";

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
