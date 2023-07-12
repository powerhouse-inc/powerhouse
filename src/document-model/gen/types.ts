import { Document } from '../../document/types';
import { DocumentModelState } from '@acaldas/document-model-graphql/document-model';
import { DocumentModelAction } from './actions';

export type ExtendedDocumentModelState = Document<DocumentModelState, DocumentModelAction>;