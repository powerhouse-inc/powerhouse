import {
  type Action,
  type DocumentAction,
  type DocumentModelModule,
  type PartialState,
  type PHBaseState,
  type PHDocument,
} from "document-model";

type PascalCaseSegments<S extends string> =
  S extends `${infer First}_${infer Rest}`
    ? `${Capitalize<Lowercase<First>>}${PascalCaseSegments<Rest>}`
    : Capitalize<Lowercase<S>>;

type ScreamingSnakeToCamelCase<S extends string> =
  S extends `${infer First}_${infer Rest}`
    ? `${Lowercase<First>}${PascalCaseSegments<Rest>}`
    : Lowercase<S>;

type ActionMethods<TAction extends Action = DocumentAction> = {
  [A in TAction | DocumentAction as ScreamingSnakeToCamelCase<A["type"]>]: (
    input: A["input"],
  ) => any;
};

export type IBasePHDocument<
  TState extends PHBaseState = PHBaseState,
  TAction extends Action = Action,
> = PHDocument<TState> & {
  mutate(action: TAction | DocumentAction): IBasePHDocument<TState, TAction>;
};

export class PHDocumentBuilder<
  TState extends PHBaseState = PHBaseState,
  TAction extends Action = Action,
> {
  #documentModelModule: DocumentModelModule<TState>;
  #document: PHDocument<TState> | undefined;

  constructor(documentModelModule: DocumentModelModule<TState>) {
    this.#documentModelModule = documentModelModule;
  }

  withDocument(document: PHDocument<TState>): this {
    this.#documentModelModule.utils.assertIsDocumentOfType(document);
    this.#document = document;
    return this;
  }

  build(): _BasePHDocument<TState, TAction> {
    const document =
      this.#document ?? this.#documentModelModule.utils.createDocument();
    return new _BasePHDocument<TState, TAction>(
      this.#documentModelModule,
      document,
    );
  }
}

type BasePHDocumentOptions<TState extends PHBaseState> =
  | {
      initialDocument: PHDocument<TState>;
    }
  | {
      initialState: PartialState<TState>;
    };

class _BasePHDocument<
  TState extends PHBaseState = PHBaseState,
  TAction extends Action = Action,
> implements IBasePHDocument<TState, TAction>
{
  #documentModel: DocumentModelModule<TState>;
  #document: PHDocument<TState>;

  constructor(
    documentModelModule: DocumentModelModule<TState>,
    options?: BasePHDocumentOptions<TState>,
  ) {
    this.#documentModel = documentModelModule;
    this.#document = this.#initDocument(options);
  }

  #initDocument(options?: BasePHDocumentOptions<TState>) {
    if (!options) {
      return this.#documentModel.utils.createDocument();
    }
    if ("initialDocument" in options) {
      this.#documentModel.utils.assertIsDocumentOfType(options.initialDocument);
      return options.initialDocument;
    } else if ("initialState" in options) {
      const initialState = this.#documentModel.utils.createState(
        options.initialState,
      );
      this.#documentModel.utils.assertIsStateOfType(initialState);
      return this.#documentModel.utils.createDocument(initialState);
    }
    return this.#documentModel.utils.createDocument();
  }

  get header() {
    return this.#document.header;
  }
  get state() {
    return this.#document.state;
  }
  get initialState() {
    return this.#document.initialState;
  }
  get operations() {
    return this.#document.operations;
  }
  get clipboard() {
    return this.#document.clipboard;
  }

  mutate(action: TAction | DocumentAction): this {
    this.#document = this.#documentModel.reducer(this.#document, action);
    return this;
  }
}

function CreateDocumentModelClass<
  TState extends PHBaseState,
  TAction extends Action,
  TBase extends new (...args: any[]) => IBasePHDocument<TState, TAction>,
>(documentModelModule: DocumentModelModule<TState>, Base: TBase) {
  return class extends Base {
    constructor(...args: any[]) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      super(...args);
      return new Proxy(this, {
        get(target, prop, receiver) {
          const value = Reflect.get(target, prop, receiver);
          if (value) return value;
          return () => `Calling dynamic method: ${String(prop)}`;
        },
      });
    }
  };
}

// const Test = CreateDocumentModelClass(AppModule, _BasePHDocument);
// export class AppModuleDocument extends BasePHDocument<
//   AppModulePHState,
//   AppModuleAction
// > {
//   constructor(options?: BasePHDocumentOptions<AppModulePHState>) {
//     super(AppModule, options);
//   }
// }

// const doc = new Test();
// doc.
// doc.doc.setAppName("test");
