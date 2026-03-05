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

export type ActionMap<TAction extends Action, TReturn = void> = {
  [K in (TAction | DocumentAction)["type"] as ScreamingSnakeToCamel<K>]: (
    input: Extract<TAction | DocumentAction, { type: K }>["input"],
  ) => TReturn & ActionMap<TAction, TReturn>;
};

export class PHDocumentController<
  TState extends PHBaseState,
> implements PHDocument<TState> {
  protected module: DocumentModelModule<TState>;
  protected document: PHDocument<TState>;

  constructor(
    module: DocumentModelModule<TState>,
    initialDocument?: PHDocument<TState>,
  ) {
    this.module = module;
    this.document = initialDocument ?? module.utils.createDocument();

    // dynamically add action methods to the controller
    for (const actionType in this.module.actions) {
      Object.defineProperty(this, actionType, {
        value: (input: unknown) => {
          const action = this.module.actions[actionType](input);
          this.document = this.module.reducer(this.document, action);
          return this;
        },
      });
    }
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
