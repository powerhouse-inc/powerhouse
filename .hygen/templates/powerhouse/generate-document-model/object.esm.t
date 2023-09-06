---
to: "<%= rootDir %>/<%= h.changeCase.param(documentType) %>/gen/object.ts"
force: true
---
import { BaseDocument, ExtendedState, applyMixins } from 'document-model/document';
import { <%= h.changeCase.pascal(documentType) %>State } from './types';
import { <%= h.changeCase.pascal(documentType) %>Action } from './actions';
import { reducer } from './reducer';
import utils from './utils';
<% modules.forEach(module => { _%>
import <%= h.changeCase.pascal(documentType) %>_<%= h.changeCase.pascal(module.name) %> from './<%= module.name %>/object';
<% }); _%>

<% modules.forEach(module => { _%>
export * from './<%= module.name %>/object';
<% }); _%>

// eslint-disable-next-line @typescript-eslint/no-empty-interface
interface <%= h.changeCase.pascal(documentType) %> extends 
<%= modules.map(m => '    ' + h.changeCase.pascal(documentType) + '_' + h.changeCase.pascal(m.name)).join(',\n') %> {}

class <%= h.changeCase.pascal(documentType) %> extends BaseDocument<<%= h.changeCase.pascal(documentType) %>State, <%= h.changeCase.pascal(documentType) %>Action> {
    static fileExtension = '<%= extension %>';

    constructor(initialState?: Partial<ExtendedState<Partial<<%= h.changeCase.pascal(documentType) %>State>>>) {
        super(reducer, utils.createDocument(initialState));
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