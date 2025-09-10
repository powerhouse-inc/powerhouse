---
to: "<%= rootDir %>/<%= h.changeCase.param(documentType) %>/gen/types.ts"
force: true
---
import type { PHDocument } from 'document-model';
import type { <%= h.changeCase.pascal(documentType) %>Action } from './actions.js';
import type { <%= h.changeCase.pascal(documentType) %>PHState } from './ph-factories.js';
import type {
  <%= h.changeCase.pascal(documentType) %>State,
<% if(hasLocalSchema) { -%>
  <%= h.changeCase.pascal(documentType) %>LocalState,
<%} -%>
} from './schema/types.js';

export { z } from './schema/index.js';
export type * from './schema/types.js';
<% if(!hasLocalSchema) { -%>
<%= 'type ' + h.changeCase.pascal(documentType) %>LocalState = Record<PropertyKey, never>;
<%} -%>
export type <%= h.changeCase.pascal(documentType) %>Document = PHDocument<<%= h.changeCase.pascal(documentType) %>PHState>;
export type { <%= h.changeCase.pascal(documentType) %>State, <%= h.changeCase.pascal(documentType) %>LocalState, <%= h.changeCase.pascal(documentType) %>Action };