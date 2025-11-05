---
to: "<%= rootDir %>/index.ts"
force: true
---
/**
* This is a scaffold file meant for customization.
* Delete the file and run the code generator again to have it reset
*/
<% moduleExports.forEach(me => { _%>
export { <%= me.pascalCaseName %> } from "./<%= me.paramCaseName %>/module.js";
<% }); _%>