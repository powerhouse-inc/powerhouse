---
inject: true
append: true
to: "<%= rootDir %>/index.ts"
skip_if: "<%= h.changeCase.pascal(name) %>"
---
export * as <%= h.changeCase.pascal(name) %>Subgraph from "./<%= h.changeCase.param(name)  %>/index.js";