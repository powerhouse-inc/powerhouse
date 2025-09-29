---
to: "<%= rootDir %>/<%= h.changeCase.param(documentType) %>/gen/index.ts"
force: true
---
export * from './actions.js';
export * from './document-model.js';
export * from './types.js';
export * as actions from './creators.js';
export {
  create<%= h.changeCase.pascal(documentType) %>Document,
  createState,
  defaultPHState,
  defaultGlobalState,
  defaultLocalState,
} from './ph-factories.js';