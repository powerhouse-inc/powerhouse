---
inject: true
append: true
to: "<%= rootDir %>/index.ts"
skip_if: "<%= h.changeCase.pascal(name) %>"
---
export { <%= h.changeCase.pascal(name) %>Processor } from "./<%= h.changeCase.param(name)  %>/index.js";