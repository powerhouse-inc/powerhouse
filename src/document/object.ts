import { loadState, prune, redo, setName, undo } from './actions';
import { BaseAction } from './actions/types';
import { Action, Attachment, Document, Reducer } from './types';
import { createDocument, loadFromFile, saveToFile } from './utils';

export abstract class DocumentObject<T, A extends Action> {
    protected state: Document<T, A>;
    private reducer: Reducer<T, A | BaseAction>;

    constructor(
        reducer: Reducer<T, A | BaseAction>,
        initialState?: Partial<Document<T, A>> & { data: T }
    ) {
        this.reducer = reducer;
        this.state = createDocument(initialState);
    }

    protected dispatch(action: A | BaseAction) {
        this.state = this.reducer(this.state, action);
        return this;
    }

    protected saveToFile(path: string, extension: string) {
        return saveToFile(this.state, path, extension);
    }

    async loadFromFile(path: string) {
        this.state = await loadFromFile<T, A | BaseAction>(path, this.reducer);
    }

    protected static async stateFromFile<T, A extends Action>(
        path: string,
        reducer: Reducer<T, A | BaseAction>
    ) {
        const state = await loadFromFile<T, A>(path, reducer);
        return state;
    }

    get name() {
        return this.state.name;
    }

    get documentType() {
        return this.state.documentType;
    }

    get created() {
        return this.state.created;
    }

    get lastModified() {
        return this.state.lastModified;
    }

    get revision() {
        return this.state.revision;
    }

    get initialState() {
        return this.state.initialState;
    }

    get operations() {
        return this.state.operations;
    }

    public getAttachment(attachment: Attachment) {
        return this.state.fileRegistry[attachment];
    }

    /*
     *   Base operations
     */

    public setName(name: string) {
        this.dispatch(setName(name));
    }

    public undo(count: number) {
        this.dispatch(undo(count));
    }

    public redo(count: number) {
        this.dispatch(redo(count));
    }

    public prune(start?: number | undefined, end?: number | undefined) {
        this.dispatch(prune(start, end));
    }

    public loadState(
        state: Pick<Document, 'data' | 'name'>,
        operations: number
    ) {
        this.dispatch(loadState(state, operations));
    }
}

// Applies multiple mixins to the base class
// https://www.typescriptlang.org/docs/handbook/mixins.html#alternative-pattern
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applyMixins(derivedCtor: any, constructors: any[]) {
    constructors.forEach(baseCtor => {
        Object.getOwnPropertyNames(baseCtor.prototype).forEach(name => {
            Object.defineProperty(
                derivedCtor.prototype,
                name,
                Object.getOwnPropertyDescriptor(baseCtor.prototype, name) ||
                    Object.create(null)
            );
        });
    });
}
