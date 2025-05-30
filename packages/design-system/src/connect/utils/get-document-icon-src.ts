import { DEFAULT, documentTypes, iconMap, type TDocumentType } from "#connect";

export function getDocumentIconSrc(
  documentType: TDocumentType | null,
  customDocumentIconSrc?: string,
) {
  if (customDocumentIconSrc) {
    return customDocumentIconSrc;
  }

  if (!documentType) {
    return iconMap[DEFAULT];
  }

  if (documentTypes.includes(documentType as (typeof documentTypes)[number])) {
    return iconMap[documentType];
  }

  return iconMap[DEFAULT];
}
