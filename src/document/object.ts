import { BaseAction } from './actions';
import { Action, Document, Reducer } from './types';
import { createDocument, loadFromFile, saveToFile } from './utils';

export abstract class DocumentObject<T, A extends Action> {
    private state: Document<T, A>;
    private reducer: Reducer<T, A | BaseAction>;

    constructor(
        reducer: Reducer<T, A | BaseAction>,
        initialState?: Partial<Document<T, A>> & { data: T }
    ) {
        this.reducer = reducer;
        this.state = createDocument(initialState);
    }

    public getState(): Document<T, A> {
        return JSON.parse(JSON.stringify(this.state));
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
}
