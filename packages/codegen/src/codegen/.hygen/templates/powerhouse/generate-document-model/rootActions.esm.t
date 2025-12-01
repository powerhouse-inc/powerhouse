---
to: "<%= rootDir %>/<%= paramCaseDocumentType %>/actions.ts"
force: true
---
import { baseActions } from "document-model";
import { <% modules.forEach(module => { _%>
<%= h.changeCase.camel(module.name) %>Actions,
<% }); _%>  } from "./gen/creators.js";

/** Actions for the <%= pascalCaseDocumentType %> document model */
export const actions = { ...baseActions, <% modules.forEach(module => { _%>
   ...<%= h.changeCase.camel(module.name) %>Actions,
<% }); _%> };
