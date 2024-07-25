import { documentTypes } from '@/connect';

export type DocumentTypes = typeof documentTypes;

export type TDocumentType = DocumentTypes[number];
