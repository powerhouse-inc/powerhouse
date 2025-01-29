import {
  BaseDocument,
  ExtendedState,
  PartialState,
  applyMixins,
  SignalDispatch,
} from "document-model/document";
import { ScopeFrameworkState, ScopeFrameworkLocalState } from "./types";
import { ScopeFrameworkAction } from "./actions";
import { reducer } from "./reducer";
import utils from "./utils";
import ScopeFramework_Main from "./main/object";

export * from "./main/object";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
interface ScopeFramework extends ScopeFramework_Main {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
class ScopeFramework extends BaseDocument<
  ScopeFrameworkState,
  ScopeFrameworkAction,
  ScopeFrameworkLocalState
> {
  static fileExtension = "mdsf";

  constructor(
    initialState?: Partial<
      ExtendedState<
        PartialState<ScopeFrameworkState>,
        PartialState<ScopeFrameworkLocalState>
      >
    >,
    dispatch?: SignalDispatch,
  ) {
    super(reducer, utils.createDocument(initialState), dispatch);
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

applyMixins(ScopeFramework, [ScopeFramework_Main]);

export { ScopeFramework };
