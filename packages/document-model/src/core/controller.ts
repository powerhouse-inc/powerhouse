import type { DocumentModelModule } from "@powerhousedao/shared/document-model";
import type {
  Action,
  DocumentOperations,
  Operation,
  PHBaseState,
  PHDocument,
  PHDocumentHeader,
} from "./ph-types.js";
import type { DocumentAction } from "./types.js";

type ScreamingSnakeToCamel<S extends string> =
  S extends `${infer Head}_${infer Tail}`
    ? `${Lowercase<Head>}${Capitalize<ScreamingSnakeToCamel<Tail>>}`
    : Lowercase<S>;

export type DocumentChangeEvent<TState extends PHBaseState = PHBaseState> = {
  document: PHDocument<TState>;
};

export type DocumentChangeListener<TState extends PHBaseState = PHBaseState> = (
  event: DocumentChangeEvent<TState>,
) => void;

export type ActionMap<TAction extends Action, TReturn = void> = {
  [K in (TAction | DocumentAction)["type"] as ScreamingSnakeToCamel<K>]: (
    input: Extract<TAction | DocumentAction, { type: K }>["input"],
  ) => TReturn & ActionMap<TAction, TReturn>;
};

export class PHDocumentController<
  TState extends PHBaseState,
> implements PHDocument<TState> {
  readonly module: DocumentModelModule<TState>;
  protected _document: PHDocument<TState>;
  private listeners: DocumentChangeListener<TState>[] = [];

  constructor(
    module: DocumentModelModule<TState>,
    initialDocument?: PHDocument<TState>,
  ) {
    this.module = module;
    this._document = initialDocument ?? module.utils.createDocument();

    // dynamically add action methods to the controller
    for (const actionType in this.module.actions) {
      Object.defineProperty(this, actionType, {
        value: (input: unknown) => {
          const action = this.module.actions[actionType](input);
          this._document = this.module.reducer(this._document, action);
          this.notifyListeners();
          return this;
        },
      });
    }
  }

  get document(): PHDocument<TState> {
    return this._document;
  }

  get header(): PHDocumentHeader {
    return this.document.header;
  }
  get state(): TState {
    return this.document.state;
  }
  get initialState(): TState {
    return this.document.initialState;
  }
  get operations(): DocumentOperations {
    return this.document.operations;
  }
  get clipboard(): Operation[] {
    return this.document.clipboard;
  }

  onChange(listener: DocumentChangeListener<TState>): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notifyListeners(): void {
    if (this.listeners.length === 0) return;
    const event: DocumentChangeEvent<TState> = { document: this._document };
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  static forDocumentModel<TState extends PHBaseState, TAction extends Action>(
    module: DocumentModelModule<TState>,
  ) {
    return class extends PHDocumentController<TState> {
      constructor(initialDocument?: PHDocument<TState>) {
        super(module, initialDocument);
      }
    } as unknown as new (
      initialDocument?: PHDocument<TState>,
    ) => PHDocumentController<TState> &
      ActionMap<TAction, PHDocumentController<TState>>;
  }
}
