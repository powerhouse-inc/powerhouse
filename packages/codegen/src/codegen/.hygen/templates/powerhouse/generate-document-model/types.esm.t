---
to: "<%= rootDir %>/<%= h.changeCase.param(documentType) %>/gen/types.ts"
force: true
---
import type { PHDocument, PHBaseState } from 'document-model';
import type { <%= h.changeCase.pascal(documentType) %>Action } from './actions.js';
import type {
  <%= h.changeCase.pascal(documentType) %>State as <%= h.changeCase.pascal(documentType) %>GlobalState,
<% if(hasLocalSchema) { -%>
  <%= h.changeCase.pascal(documentType) %>LocalState,
<%} -%>
} from './schema/types.js';

export { z } from './schema/index.js';
export * from './schema/types.js';
<% if(!hasLocalSchema) { -%>
<%= 'type ' + h.changeCase.pascal(documentType) %>LocalState = Record<PropertyKey, never>;
<%} -%>
type <%= h.changeCase.pascal(documentType) %>PHState = PHBaseState & {
  global: <%= h.changeCase.pascal(documentType) %>GlobalState;
  local: <%= h.changeCase.pascal(documentType) %>LocalState;
};
type <%= h.changeCase.pascal(documentType) %>Document = PHDocument<<%= h.changeCase.pascal(documentType) %>PHState>;

export type { 
  <%= h.changeCase.pascal(documentType) %>GlobalState, 
  <%= h.changeCase.pascal(documentType) %>LocalState,
  <%= h.changeCase.pascal(documentType) %>PHState, 
  <%= h.changeCase.pascal(documentType) %>Action,
  <%= h.changeCase.pascal(documentType) %>Document,
};