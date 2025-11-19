---
to: "<%= rootDir %>/<%= paramCaseDocumentType %>/gen/types.ts"
force: true
---
import type { PHDocument, PHBaseState } from 'document-model';
import type { <%= actionTypeName %> } from './actions.js';
import type {
  <%= stateName %> as <%= globalStateName %>,
<% if(hasLocalSchema) { -%>
  <%= localStateName %>,
<%} -%>
} from './schema/types.js';

<% if(!hasLocalSchema) { -%>
<%= 'type ' + localStateName %> = Record<PropertyKey, never>;
<%} -%>
type <%= phStateName %> = PHBaseState & {
  global: <%= globalStateName %>;
  local: <%= localStateName %>;
};
type <%= phDocumentTypeName %> = PHDocument<<%= phStateName %>>;

export * from './schema/types.js';

export type { 
  <%= globalStateName %>, 
  <%= localStateName %>,
  <%= phStateName %>, 
  <%= actionTypeName %>,
  <%= phDocumentTypeName %>,
};