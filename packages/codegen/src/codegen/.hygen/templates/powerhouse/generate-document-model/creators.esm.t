---
to: "<%= rootDir %>/<%= paramCaseDocumentType %>/gen/creators.ts"
force: true
---

<% modules.forEach(module => { _%>
export * from "./<%= h.changeCase.param(module.name) %>/creators.js";
export * as <%= h.changeCase.camel(module.name) %>Actions from "./<%= h.changeCase.param(module.name) %>/creators.js";
<% }); _%>