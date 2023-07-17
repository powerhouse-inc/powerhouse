import type { Document } from '../../document/types';
import type { DocumentModelState } from '@acaldas/document-model-graphql/document-model';
import type { DocumentModelAction } from './actions';

import type * as types from '@acaldas/document-model-graphql/document-model';

type ExtendedDocumentModelState = Document<DocumentModelState, DocumentModelAction>;

export { types, ExtendedDocumentModelState, DocumentModelAction };