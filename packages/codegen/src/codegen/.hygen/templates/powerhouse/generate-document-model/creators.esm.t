---
to: "<%= rootDir %>/<%= h.changeCase.param(documentType) %>/gen/creators.ts"
force: true
---

<% modules.forEach(module => { _%>
export * from './<%= module.name %>/creators.js';
<% }); _%>