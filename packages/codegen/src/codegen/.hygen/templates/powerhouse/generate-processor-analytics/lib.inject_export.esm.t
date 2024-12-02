---
inject: true
append: true
to: "<%= rootDir %>/index.ts"
skip_if: "<%= h.changeCase.pascal(name) %>"
---
export * as <%= h.changeCase.pascal(name) %>AnalyticsProcessor from "./<%= h.changeCase.param(name)  %>/src";