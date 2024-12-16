import { IError } from "../../utils/types";

export interface IDuplicatedListenerIdError
  extends IError<"DuplicatedListenerIdError"> {
  listenerId: string;
}

export class DuplicatedListenerIdError
  extends Error
  implements IDuplicatedListenerIdError
{
  type = "DuplicatedListenerIdError" as const;

  constructor(public listenerId: string) {
    super(`A listener with id "${listenerId}" already exists.`);
  }
}

export interface IListenerNotFoundError
  extends IError<"ListenerNotFoundError"> {
  listenerId: string;
}

export class ListenerNotFoundError
  extends Error
  implements ListenerNotFoundError
{
  type = "ListenerNotFoundError" as const;

  constructor(public listenerId: string) {
    super(`A listener with id "${listenerId}" was not found.`);
  }
}
