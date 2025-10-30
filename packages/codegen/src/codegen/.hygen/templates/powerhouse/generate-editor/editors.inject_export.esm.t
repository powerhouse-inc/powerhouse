---
inject: true
append: true
to: "<%= rootDir %>/editors.ts"
skip_if: "<%= pascalCaseEditorName %>"
---
export { <%= pascalCaseEditorName %> } from './<%= paramCaseEditorName %>/module.js';