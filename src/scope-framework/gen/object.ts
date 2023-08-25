import { ScopeFrameworkState } from './types';
import { ExtendedState } from '../../document';
import { applyMixins, BaseDocument } from '../../document/object';
import { ScopeFrameworkAction } from './actions';
import { reducer } from './reducer';
import utils from './utils';
import ScopeFramework_Main from './main/object';

export * from './main/object';

// eslint-disable-next-line @typescript-eslint/no-empty-interface
interface ScopeFramework extends 
    ScopeFramework_Main {}

class ScopeFramework extends BaseDocument<ScopeFrameworkState, ScopeFrameworkAction> {
    static fileExtension = 'mdsf';

    constructor(initialState?: Partial<ExtendedState<Partial<ScopeFrameworkState>>>) {
        super(reducer, utils.createDocument(initialState));
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