---
to: "./src/<%= h.changeCase.param(documentType) %>/gen/types.ts"
force: true
---
import type { Document, ExtendedState } from '../../document/types';
import type { <%= h.changeCase.pascal(documentType) %>State } from '@acaldas/document-model-graphql/<%= h.changeCase.param(documentType) %>';
import type { <%= h.changeCase.pascal(documentType) %>Action } from './actions';

import type * as types from '@acaldas/document-model-graphql/<%= h.changeCase.param(documentType) %>';

export type Extended<%= h.changeCase.pascal(documentType) %>State = ExtendedState<<%= h.changeCase.pascal(documentType) %>State>;
export type <%= h.changeCase.pascal(documentType) %>Document = Document<<%= h.changeCase.pascal(documentType) %>State, <%= h.changeCase.pascal(documentType) %>Action>;
export { types, <%= h.changeCase.pascal(documentType) %>State, <%= h.changeCase.pascal(documentType) %>Action };