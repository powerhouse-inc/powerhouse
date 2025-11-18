---
to: "<%= rootDir %>/<%= paramCaseDocumentType %>/gen/index.ts"
force: true
---
export * from './actions.js';
export * from './document-model.js';
export * from './types.js';
export * from './creators.js';
export {
  create<%= phDocumentTypeName %>,
  createState,
  defaultPHState,
  defaultGlobalState,
  defaultLocalState,
} from './ph-factories.js';
export * from "./utils.js";
export * from "./reducer.js";
export * from "./schema/index.js";
export * from "./document-type.js";
export * from "./document-schema.js";
<% modules.forEach(module => { _%>
export * from './<%= h.changeCase.param(module.name) %>/operations.js';
<% }); _%>