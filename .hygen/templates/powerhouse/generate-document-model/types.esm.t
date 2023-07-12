---
to: "./src/<%= h.changeCase.param(documentType) %>/gen/types.ts"
force: true
---
import { Document } from '../../document/types';
import { <%= h.changeCase.pascal(documentType) %>State } from '@acaldas/document-model-graphql/<%= h.changeCase.param(documentType) %>';
import { <%= h.changeCase.pascal(documentType) %>Action } from './actions';

export type Extended<%= h.changeCase.pascal(documentType) %>State = Document<<%= h.changeCase.pascal(documentType) %>State, <%= h.changeCase.pascal(documentType) %>Action>;