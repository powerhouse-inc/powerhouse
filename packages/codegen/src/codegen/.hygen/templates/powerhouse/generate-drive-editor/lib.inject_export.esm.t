---
inject: true
append: true
to: "<%= rootDir %>/index.ts"
skip_if: "<%= h.changeCase.pascal(name) %>"
---
export { module as <%= h.changeCase.pascal(name) %> } from './<%= h.changeCase.param(name) %>/index.js';