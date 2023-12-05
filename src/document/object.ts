import { loadState, prune, redo, setName, undo } from './actions';
import type { BaseAction } from './actions/types';
import type { SignalDispatch } from './signal';
import type {
    Action,
    AttachmentRef,
    Document,
    ExtendedState,
    Reducer,
} from './types';
import { loadFromFile, saveToFile, readOnly } from './utils';

/**
 * This is an abstract class representing a document and provides methods
 * for creating and manipulating documents.
 * @typeparam T - The type of data stored in the document.
 * @typeparam A - The type of action the document can take.
 */
export abstract class BaseDocument<T, A extends Action> {
    protected _document: Document<T, A>;
    private _reducer: Reducer<T, A>;
    private _signalDispatch?: SignalDispatch;

    /**
     * Constructs a BaseDocument instance with an initial state.
     * @param reducer - The reducer function that updates the state.
     * @param document - The initial state of the document.
     */
    constructor(
        reducer: Reducer<T, A>,
        document: Document<T, A>,
        signalDispatch?: SignalDispatch,
    ) {
        this._reducer = reducer;
        this._document = document;
        this._signalDispatch = signalDispatch;
    }

    /**
     * Dispatches an action to update the state of the document.
     * @param action - The action to dispatch.
     * @returns The Document instance.
     */
    protected dispatch(action: A | BaseAction) {
        this._document = this._reducer(
            this._document,
            action,
            this._signalDispatch,
        );
        return this;
    }

    /**
     * Saves the state of the document to a file.
     * @param path - The file path where the state should be saved.
     * @param extension - The file extension to use when saving the state.
     * @returns The file path where the state was saved.
     */
    protected saveToFile(path: string, extension: string, name?: string) {
        return saveToFile(this._document, path, extension, name);
    }

    /**
     * Loads the state of the document from a file.
     * @param path - The file path where the state is stored.
     */
    async loadFromFile(path: string) {
        this._document = await loadFromFile<T, A>(path, this._reducer);
    }

    /**
     * Loads the state of the document from a file and returns it.
     * @param path - The file path where the state is stored.
     * @param reducer - The reducer function that updates the state.
     * @returns The state of the document.
     */
    protected static async stateFromFile<T, A extends Action>(
        path: string,
        reducer: Reducer<T, A>,
    ) {
        const state = await loadFromFile<T, A>(path, reducer);
        return state;
    }

    /**
     *    Gets the current state of the document.
     */
    get state() {
        return readOnly(this._document.state);
    }

    /**
     *    Gets the list of operations performed on the document.
     */
    get operations() {
        return readOnly(this._document.operations);
    }

    /**
     * Gets the name of the document.
     */
    get name() {
        return this._document.name;
    }

    /**
     * Gets the type of document.
     */
    get documentType() {
        return this._document.documentType;
    }

    /**
     * Gets the timestamp of the date the document was created.
     */
    get created() {
        return this._document.created;
    }

    /**
     * Gets the timestamp of the date the document was last modified.
     */
    get lastModified() {
        return this._document.lastModified;
    }

    /**
     * Gets the revision number of the document.
     */
    get revision() {
        return this._document.revision;
    }

    /**
     * Gets the initial state of the document.
     */
    get initialState() {
        return readOnly(this._document.initialState);
    }

    /**
     * Returns the current document as an object
     */
    public toDocument() {
        return readOnly(this._document);
    }

    /**
     * Gets the attachment associated with the given key.
     * @param attachment - The key of the attachment to retrieve.
     */
    public getAttachment(attachment: AttachmentRef) {
        return this._document.attachments[attachment];
    }

    /**
     * Sets the name of the document.
     * @param name - The new name of the document.
     */
    public setName(name: string) {
        this.dispatch(setName(name));
        return this;
    }

    /**
     * Reverts a number of actions from the document.
     * @param count - The number of actions to revert.
     */
    public undo(count: number) {
        this.dispatch(undo(count));
        return this;
    }

    /**
     * Reapplies a number of actions to the document.
     * @param count - The number of actions to reapply.
     */
    public redo(count: number) {
        this.dispatch(redo(count));
        return this;
    }
    /**
     * Removes a range of operations from the document.
     * @param start - The starting index of the range to remove.
     * @param end - The ending index of the range to remove.
     */
    public prune(start?: number | undefined, end?: number | undefined) {
        this.dispatch(prune(start, end));
        return this;
    }

    /**
     * Loads a document state and a set of operations.
     * @param state - The state to load.
     * @param operations - The operations to apply to the document.
     */
    public loadState(
        state: Pick<ExtendedState<T>, 'state' | 'name'>,
        operations: number,
    ) {
        this.dispatch(loadState(state, operations));
        return this;
    }
}
/**
 * Applies multiple mixins to a base class.
 * Used to have separate mixins to group methods by actions.
 *
 * @remarks
 * {@link https://www.typescriptlang.org/docs/handbook/mixins.html#alternative-pattern}
 *
 * @param derivedCtor - The class to apply the mixins to.
 * @param constructors - The constructors of the mixins.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applyMixins(derivedCtor: any, constructors: any[]) {
    constructors.forEach(baseCtor => {
        Object.getOwnPropertyNames(baseCtor.prototype).forEach(name => {
            Object.defineProperty(
                derivedCtor.prototype,
                name,
                Object.getOwnPropertyDescriptor(baseCtor.prototype, name) ||
                    Object.create(null),
            );
        });
    });
}