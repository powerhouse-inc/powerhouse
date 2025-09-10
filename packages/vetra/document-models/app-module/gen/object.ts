import type { BaseStateFromDocument, SignalDispatch } from "document-model";
import { applyMixins, BaseDocumentClass } from "document-model";
import type { AppModuleAction } from "./actions.js";
import AppModule_BaseOperations from "./base-operations/object.js";
import { reducer } from "./reducer.js";
import type {
  AppModuleDocument,
  AppModuleLocalState,
  AppModuleState,
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
    initialState?: Partial<AppModulePHState>,
    dispatch?: SignalDispatch,
  ) {
    super(reducer, createDocument(initialState), dispatch);
  }
}

applyMixins(AppModule, [AppModule_BaseOperations]);

export { AppModule };
