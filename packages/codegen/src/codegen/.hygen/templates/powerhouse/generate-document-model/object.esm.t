---
to: "<%= rootDir %>/<%= h.changeCase.param(documentType) %>/gen/object.ts"
force: true
---
import { BaseDocumentClass, applyMixins, type SignalDispatch } from 'document-model';
import { <%= h.changeCase.pascal(documentType) %>PHState } from './ph-factories.js';
import { <%= 'type ' + h.changeCase.pascal(documentType) %>Action } from './actions.js';
import { reducer } from './reducer.js';
import { createDocument } from './utils.js';
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
class <%= h.changeCase.pascal(documentType) %> extends BaseDocumentClass<<%= h.changeCase.pascal(documentType) %>PHState> {
    static fileExtension = '<%= extension %>';

    constructor(initialState?: Partial<<%= h.changeCase.pascal(documentType) %>PHState>, dispatch?: SignalDispatch) {
        super(reducer, createDocument(initialState), dispatch);
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