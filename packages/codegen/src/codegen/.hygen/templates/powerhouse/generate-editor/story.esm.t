---
to: "<%= rootDir %>/<%= h.changeCase.param(name) %>/<%= h.changeCase.param(name) %>.stories.tsx"
unless_exists: true
---
import Editor from './editor';
import { createDocumentStory } from 'document-model-libs/utils';
<% if(!documentTypes.length){ %>import { baseReducer, utils } from 'document-model/document';<% } %>
<% documentTypes.forEach(type => { _%>
import * as <%= documentTypesMap[type].name %>Module from "<%= documentTypesMap[type].importPath %>";
%><% }); _%>

<% if(!documentTypes.length){ %>
const { meta, CreateDocumentStory: <%= h.changeCase.pascal(name) %> } = createDocumentStory(
    Editor,
    (...args) => baseReducer(...args, document => document),
    utils.createExtendedState(),
);
export { <%= h.changeCase.pascal(name) %> };
<% } %>

<% documentTypes.forEach((type, index) => { _%>
const { <% if(index === 0){ %>meta, <% } %>CreateDocumentStory: <%= documentTypesMap[type].name %> } = createDocumentStory(
    Editor,
    <%= documentTypesMap[type].name %>Module.reducer,
    <%= documentTypesMap[type].name %>Module.utils.createDocument(),
);
export { <%= documentTypesMap[type].name %> }

%><% }); _%>

export default { ...meta, title: '<%= h.changeCase.title(name) %>' };