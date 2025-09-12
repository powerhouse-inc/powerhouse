import type { TDocumentType } from "@powerhousedao/design-system";
import { DEFAULT, documentTypes, iconMap } from "@powerhousedao/design-system";

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
