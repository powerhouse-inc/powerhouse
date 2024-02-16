import * as documentModelsExports from './document-models';
import * as editorsExports from './editors';

export * from './editors/types';
export const documentModels = Object.values(documentModelsExports);
export const editors = Object.values(editorsExports);
