---
inject: true
to: "<%= rootDir %>/index.ts"
before: "\nexport const editors = \\["
skip_if: "import <%= h.changeCase.camel(name) %>"
---
import <%= h.changeCase.camel(name) %> from './<%= h.changeCase.param(name) %>';