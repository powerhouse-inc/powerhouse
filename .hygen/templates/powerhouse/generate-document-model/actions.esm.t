---
to: "./src/<%= h.changeCase.param(documentType) %>/gen/actions.ts"
force: true
---
<% modules.forEach(module => { _%>
import { <%= h.changeCase.pascal(documentType) %><%= h.changeCase.pascal(module.name) %>Action } from './<%= module.name %>/actions';
<% }); _%>

<% modules.forEach(module => { _%>
export * from './<%= module.name %>/actions';
<% }); _%>

export type <%= h.changeCase.pascal(documentType) %>Action =
<% modules.forEach(module => { _%>
    | <%= h.changeCase.pascal(documentType) %><%= h.changeCase.pascal(module.name) %>Action
<% }); _%>;