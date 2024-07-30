import { DEFAULT, documentTypes, iconMap, TDocumentType } from '@/connect';

export function getDocumentIconSrc(
    documentType: TDocumentType,
    customDocumentIconSrc?: string,
) {
    if (customDocumentIconSrc) {
        return customDocumentIconSrc;
    }

    if (documentTypes.includes(documentType)) {
        return iconMap[documentType];
    }

    return iconMap[DEFAULT];
}
