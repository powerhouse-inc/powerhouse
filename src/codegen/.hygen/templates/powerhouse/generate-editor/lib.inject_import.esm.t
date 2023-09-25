---
inject: true
to: "<%= rootDir %>/index.ts"
before: "\nexport const editors = \\["
skip_if: "import <%= h.changeCase.pascal(name) %>"
---
import <%= h.changeCase.pascal(name) %> from './<%= h.changeCase.param(name) %>';