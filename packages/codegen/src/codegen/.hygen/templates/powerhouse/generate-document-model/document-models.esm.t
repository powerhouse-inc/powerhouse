---
inject: true
append: true
to: "<%= rootDir %>/document-models.ts"
skip_if: "<%= pascalCaseDocumentType %>"
---
export { <%= pascalCaseDocumentType %> } from './<%= paramCaseDocumentType  %>/module.js';