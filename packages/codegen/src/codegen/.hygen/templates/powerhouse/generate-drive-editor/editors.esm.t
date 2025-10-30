---
inject: true
append: true
to: "<%= rootDir %>/editors.ts"
skip_if: "<%= pascalCaseDriveEditorName %>"
---
export { <%= pascalCaseDriveEditorName %> } from './<%= paramCaseDriveEditorName %>/module.js';