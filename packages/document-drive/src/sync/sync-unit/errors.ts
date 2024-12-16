import { IError } from "../../utils/types";

export interface IDuplicatedSyncUnitIdError
  extends IError<"DuplicatedSyncUnitIdError"> {
  syncUnitId: string;
}

export class DuplicatedSyncUnitIdError
  extends Error
  implements IDuplicatedSyncUnitIdError
{
  type = "DuplicatedSyncUnitIdError" as const;

  constructor(public syncUnitId: string) {
    super(`A sync unit with id "${syncUnitId}" already exists.`);
  }
}

export interface ISyncUnitNotFoundError
  extends IError<"SyncUnitNotFoundError"> {
  syncUnitId: string;
}

export class SyncUnitNotFoundError
  extends Error
  implements ISyncUnitNotFoundError
{
  type = "SyncUnitNotFoundError" as const;

  constructor(public syncUnitId: string) {
    super(`A sync unit with id "${syncUnitId}" was not found.`);
  }
}
