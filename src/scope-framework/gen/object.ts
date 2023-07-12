import { BaseDocument, applyMixins } from '../../document/object';
import { ScopeFrameworkState } from '@acaldas/document-model-graphql/scope-framework';
import { ScopeFrameworkAction } from './actions';
import { createEmptyExtendedScopeFrameworkState } from '../custom/utils';
import { reducer } from './reducer';
import { ExtendedScopeFrameworkState } from './types';

import ScopeFramework_Main from './main/object';

export * from './main/object';

interface ScopeFramework extends 
    ScopeFramework_Main {}

class ScopeFramework extends BaseDocument<ScopeFrameworkState, ScopeFrameworkAction> {
    static fileExtension = 'mdsf';

    public get state() { return this._state.state; }

    constructor(initialState?: ExtendedScopeFrameworkState) {
        super(reducer, initialState || createEmptyExtendedScopeFrameworkState());
    }

    public saveToFile(path: string, name?: string) {
        return super.saveToFile(path, ScopeFramework.fileExtension, name);
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

applyMixins(ScopeFramework, [
    ScopeFramework_Main
]);

export { ScopeFramework };