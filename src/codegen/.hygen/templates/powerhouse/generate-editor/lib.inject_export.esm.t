---
inject: true
to: "<%= rootDir %>/index.ts"
after: "export const editors = \\["
skip_if: "<%= h.changeCase.camel(name) %>"
---
    <%= h.changeCase.camel(name) %>,