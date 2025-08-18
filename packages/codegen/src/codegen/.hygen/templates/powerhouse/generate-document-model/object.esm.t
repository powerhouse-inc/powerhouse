---
to: "<%= rootDir %>/<%= h.changeCase.param(documentType) %>/gen/object.ts"
force: true
---
import { BaseDocumentClass, type ExtendedStateFromDocument, type PartialState, applyMixins, type SignalDispatch } from 'document-model';
import { <%= 'type ' + h.changeCase.pascal(documentType) %>State, <%= 'type ' + h.changeCase.pascal(documentType) %>LocalState, <%= 'type ' + h.changeCase.pascal(documentType) %>Document } from './types.js';
import { <%= 'type ' + h.changeCase.pascal(documentType) %>Action } from './actions.js';
import { reducer } from './reducer.js';
import utils from './utils.js';
<% modules.forEach(module => { _%>
import <%= h.changeCase.pascal(documentType) %>_<%= h.changeCase.pascal(module.name) %> from './<%= module.name %>/object.js';
<% }); _%>

<% modules.forEach(module => { _%>
export * from './<%= module.name %>/object.js';
<% }); _%>

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
interface <%= h.changeCase.pascal(documentType) %> extends 
<%= modules.map(m => '    ' + h.changeCase.pascal(documentType) + '_' + h.changeCase.pascal(m.name)).join(',\n') %> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
class <%= h.changeCase.pascal(documentType) %> extends BaseDocumentClass<<%= h.changeCase.pascal(documentType) %>State, <%= h.changeCase.pascal(documentType) %>LocalState, <%= h.changeCase.pascal(documentType) %>Action> {
    static fileExtension = '<%= extension %>';

    constructor(initialState?: Partial<ExtendedStateFromDocument<<%= h.changeCase.pascal(documentType) %>Document>>, dispatch?: SignalDispatch) {
        super(reducer, utils.createDocument(initialState), dispatch);
    }

    public saveToFile(path: string, name?: string) {
        return super.saveToFile(path, <%= h.changeCase.pascal(documentType) %>.fileExtension, name);
    }

    public loadFromFile(path: string) {
        return super.loadFromFile(path);
    }

    static async fromFile(path: string) {
        const document = new this();
        await document.loadFromFile(path);
        return document;
    }
}

applyMixins(<%= h.changeCase.pascal(documentType) %>, [
<%= modules.map(m => '    ' + h.changeCase.pascal(documentType) + '_' + h.changeCase.pascal(m.name)).join(',\n') %>
]);

export { <%= h.changeCase.pascal(documentType) %> };