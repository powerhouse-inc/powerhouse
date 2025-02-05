import {
    BaseDocument,
    ExtendedState,
    PartialState,
    applyMixins,
    SignalDispatch,
} from "document-model";
  import { AccountSnapshotState, AccountSnapshotLocalState } from "./types.js";
import { AccountSnapshotAction } from "./actions.js";
import { reducer } from "./reducer.js";
import utils from "./utils.js";
import AccountSnapshot_Snapshot from "./snapshot/object.js";

export * from "./snapshot/object.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
interface AccountSnapshot extends AccountSnapshot_Snapshot {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
class AccountSnapshot extends BaseDocument<
  AccountSnapshotState,
  AccountSnapshotAction,
  AccountSnapshotLocalState
> {
  static fileExtension = "phas";

  constructor(
    initialState?: Partial<
      ExtendedState<
        PartialState<AccountSnapshotState>,
        PartialState<AccountSnapshotLocalState>
      >
    >,
    dispatch?: SignalDispatch,
  ) {
    super(reducer, utils.createDocument(initialState), dispatch);
  }

  public saveToFile(path: string, name?: string) {
    return super.saveToFile(path, AccountSnapshot.fileExtension, name);
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

applyMixins(AccountSnapshot, [AccountSnapshot_Snapshot]);

export { AccountSnapshot };
