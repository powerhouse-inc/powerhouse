---
to: "<%= rootDir %>/<%= h.changeCase.param(documentType) %>/gen/types.ts"
force: true
---
import type { Document, ExtendedState } from 'document-model/document';
import type { <%= h.changeCase.pascal(documentType) %>State, <%= h.changeCase.pascal(documentType) %>LocalState } from './schema/types';
import type { <%= h.changeCase.pascal(documentType) %>Action } from './actions';

export { z } from './schema';
export type * from './schema/types';
export type Extended<%= h.changeCase.pascal(documentType) %>State = ExtendedState<<%= h.changeCase.pascal(documentType) %>State, <%= h.changeCase.pascal(documentType) %>LocalState>;
export type <%= h.changeCase.pascal(documentType) %>Document = Document<<%= h.changeCase.pascal(documentType) %>State, <%= h.changeCase.pascal(documentType) %>Action, <%= h.changeCase.pascal(documentType) %>LocalState>;
export { <%= h.changeCase.pascal(documentType) %>State, <%= h.changeCase.pascal(documentType) %>LocalState, <%= h.changeCase.pascal(documentType) %>Action };