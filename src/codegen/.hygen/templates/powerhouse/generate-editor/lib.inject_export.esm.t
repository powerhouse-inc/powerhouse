---
inject: true
to: "<%= rootDir %>/index.ts"
after: "export const editors = \\["
skip_if: "<%= h.changeCase.pascal(name) %>"
---
    <%= h.changeCase.pascal(name) %>,