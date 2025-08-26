import {
  BaseDocumentClass,
  applyMixins,
  type SignalDispatch,
} from "document-model";
import { AppModulePHState } from "./ph-factories.js";
import { type AppModuleAction } from "./actions.js";
import { reducer } from "./reducer.js";
import { createDocument } from "./utils.js";
import AppModule_BaseOperations from "./base-operations/object.js";

export * from "./base-operations/object.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
interface AppModule extends AppModule_BaseOperations {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
class AppModule extends BaseDocumentClass<AppModulePHState> {
  static fileExtension = ".phdm";

  constructor(
    initialState?: Partial<AppModulePHState>,
    dispatch?: SignalDispatch,
  ) {
    super(reducer, createDocument(initialState), dispatch);
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
