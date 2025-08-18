---
to: "<%= rootDir %>/<%= h.changeCase.param(documentType) %>/gen/types.ts"
force: true
---
import type { PHDocument, ExtendedStateFromDocument } from 'document-model';
import type { <%= h.changeCase.pascal(documentType) %>State } from './schema/types.js';
<% if(hasLocalSchema) { -%>
import type { <%= h.changeCase.pascal(documentType) %>LocalState } from './schema/types.js';
<%} -%>
import type { <%= h.changeCase.pascal(documentType) %>Action } from './actions.js';

export { z } from './schema/index.js';
export type * from './schema/types.js';
<% if(!hasLocalSchema) { -%>
<%= 'type ' + h.changeCase.pascal(documentType) %>LocalState = Record<PropertyKey, never>;
<%} -%>
export type Extended<%= h.changeCase.pascal(documentType) %>State = ExtendedStateFromDocument<<%= h.changeCase.pascal(documentType) %>Document>;
export <%= 'type ' + h.changeCase.pascal(documentType) %>Document = PHDocument<<%= h.changeCase.pascal(documentType) %>State, <%= h.changeCase.pascal(documentType) %>LocalState>;
export type { <%= h.changeCase.pascal(documentType) %>State, <%= h.changeCase.pascal(documentType) %>LocalState, <%= h.changeCase.pascal(documentType) %>Action };