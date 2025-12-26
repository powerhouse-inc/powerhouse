import type { Action, DocumentAction, PHDocument } from "document-model";

export type DocumentDispatch<TAction extends Action> = (
  actionOrActions:
    | TAction
    | TAction[]
    | DocumentAction
    | DocumentAction[]
    | undefined,
  onErrors?: (errors: Error[]) => void,
) => void;

export type PromiseWithState<T> = Promise<T> & PromiseState<T>;

export type FulfilledPromise<T> = Promise<T> & {
  status: "fulfilled";
  value: T;
};

export type RejectedPromise<T> = Promise<T> & {
  status: "rejected";
  reason: unknown;
};

export type PromiseState<T> =
  | {
      status: "pending";
    }
  | { status: "fulfilled"; value: T }
  | { status: "rejected"; reason: unknown };

export interface IDocumentCache {
  get(id: string, refetch?: boolean): Promise<PHDocument>;
  getBatch(ids: string[], refetch?: boolean): Promise<PHDocument[]>;
  subscribe(id: string | string[], callback: () => void): () => void;
}
