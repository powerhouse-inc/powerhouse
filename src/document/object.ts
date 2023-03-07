import { BaseAction } from './actions';
import { Action, Document, Reducer } from './types';
import { createDocument } from './utils';

export class DocumentObject<T, A extends Action> {
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
}
