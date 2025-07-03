---
inject: true
append: true
to: "<%= rootDir %>/index.ts"
skip_if: "<%= h.changeCase.pascal(name) %>"
unless_exists: true
---
export * as <%= h.changeCase.pascal(name) %>Processor from "./<%= h.changeCase.param(name)  %>/index.js";
export { <%= h.changeCase.camel(name) %>ProcessorFactory } from "./<%= h.changeCase.param(name)  %>/factory.js";
