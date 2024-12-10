---
inject: true
append: true
to: "<%= rootDir %>/index.ts"
skip_if: "<%= h.changeCase.pascal(name) %>"
force: true
---
export * as <%= h.changeCase.pascal(name) %>OperationalProcessor from "./<%= h.changeCase.param(name)  %>/src";
