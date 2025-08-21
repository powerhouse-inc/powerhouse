import {
  BaseDocumentClass,
  type BaseStateFromDocument,
  type PartialState,
  applyMixins,
  type SignalDispatch,
} from "document-model";
import {
  type VetraPackageState,
  type VetraPackageLocalState,
  type VetraPackageDocument,
} from "./types.js";
import { type VetraPackageAction } from "./actions.js";
import { reducer } from "./reducer.js";
import utils from "./utils.js";
import VetraPackage_BaseOperations from "./base-operations/object.js";

export * from "./base-operations/object.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
interface VetraPackage extends VetraPackage_BaseOperations {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
class VetraPackage extends BaseDocumentClass<
  VetraPackageState,
  VetraPackageLocalState,
  VetraPackageAction
> {
  static fileExtension = ".phdm";

  constructor(
    initialState?: Partial<BaseStateFromDocument<VetraPackageDocument>>,
    dispatch?: SignalDispatch,
  ) {
    super(reducer, utils.createDocument(initialState), dispatch);
  }

  public saveToFile(path: string, name?: string) {
    return super.saveToFile(path, VetraPackage.fileExtension, name);
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

applyMixins(VetraPackage, [VetraPackage_BaseOperations]);

export { VetraPackage };
