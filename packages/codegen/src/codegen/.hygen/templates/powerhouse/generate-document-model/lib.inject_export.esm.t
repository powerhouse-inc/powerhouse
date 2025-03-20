---
inject: true
append: true
to: "<%= rootDir %>/index.ts"
skip_if: "<%= h.changeCase.pascal(documentType) %>"
---
export { module as <%= h.changeCase.pascal(documentType) %> } from './<%= h.changeCase.param(documentType)  %>/index.js';