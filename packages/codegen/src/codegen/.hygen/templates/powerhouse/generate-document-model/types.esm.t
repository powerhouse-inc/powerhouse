---
to: "<%= rootDir %>/<%= h.changeCase.param(documentType) %>/gen/types.ts"
force: true
---
import type { PHDocument, ExtendedState } from 'document-model';
import type { <%= h.changeCase.pascal(documentType) %>State } from './schema/types';
<% if(hasLocalSchema) { -%>
import type { <%= h.changeCase.pascal(documentType) %>LocalState } from './schema/types';
<%} -%>
import type { <%= h.changeCase.pascal(documentType) %>Action } from './actions';

export { z } from './schema';
export type * from './schema/types';
<% if(!hasLocalSchema) { -%>
type <%= h.changeCase.pascal(documentType) %>LocalState = Record<PropertyKey, never>;
<%} -%>
export type Extended<%= h.changeCase.pascal(documentType) %>State = ExtendedState<<%= h.changeCase.pascal(documentType) %>State, <%= h.changeCase.pascal(documentType) %>LocalState>;
export type <%= h.changeCase.pascal(documentType) %>Document = PHDocument<<%= h.changeCase.pascal(documentType) %>State, <%= h.changeCase.pascal(documentType) %>LocalState, <%= h.changeCase.pascal(documentType) %>Action>;
export { <%= h.changeCase.pascal(documentType) %>State, <%= h.changeCase.pascal(documentType) %>LocalState, <%= h.changeCase.pascal(documentType) %>Action };