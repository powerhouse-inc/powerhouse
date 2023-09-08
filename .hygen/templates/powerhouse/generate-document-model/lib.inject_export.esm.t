---
inject: true
to: "<%= rootDir %>/index.ts"
after: "export const documentModels = \\["
skip_if: "<%= documentType %>"
---
    <%= documentType %>,