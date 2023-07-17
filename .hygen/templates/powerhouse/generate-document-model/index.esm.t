---
to: "./src/<%= h.changeCase.param(documentType) %>/gen/index.ts"
force: true
---
export * from './actions';
export * from './object';
export * from './types';

<% modules.forEach(module => { _%>
export * from './<%= module.name %>/creators';
<% }); _%>