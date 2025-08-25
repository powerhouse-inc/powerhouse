import {
  applyMixins,
  BaseDocumentClass,
  type BaseStateFromDocument,
  type SignalDispatch,
} from "document-model";
import { type AppModuleAction } from "./actions.js";
import AppModule_BaseOperations from "./base-operations/object.js";
import { reducer } from "./reducer.js";
import {
  type AppModuleDocument,
  type AppModuleLocalState,
  type AppModuleState,
} from "./types.js";
import utils from "./utils.js";

export * from "./base-operations/object.js";

interface AppModule extends AppModule_BaseOperations {}

class AppModule extends BaseDocumentClass<
  AppModuleState,
  AppModuleLocalState,
  AppModuleAction
> {
  static fileExtension = ".phdm";

  constructor(
    initialState?: Partial<BaseStateFromDocument<AppModuleDocument>>,
    dispatch?: SignalDispatch,
  ) {
    super(reducer, utils.createDocument(initialState), dispatch);
  }

  public saveToFile(path: string, name?: string) {
    return super.saveToFile(path, AppModule.fileExtension, name);
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

applyMixins(AppModule, [AppModule_BaseOperations]);

export { AppModule };
