import type { Document, ExtendedState } from '../../document/types';
import type { DocumentModelState } from '@acaldas/document-model-graphql/document-model';
import type { DocumentModelAction } from './actions';

import type * as types from '@acaldas/document-model-graphql/document-model';

export type ExtendedDocumentModelState = ExtendedState<DocumentModelState>;
export type DocumentModelDocument = Document<DocumentModelState, DocumentModelAction>;
export { types, DocumentModelState, DocumentModelAction };