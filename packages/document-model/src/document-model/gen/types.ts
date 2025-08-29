import type {
  Action,
  BaseDocument,
  BaseDocumentClass,
  BaseState,
  DocumentModelLocalState,
  DocumentModelState,
} from "document-model";
export type * from "./actions.js";
export type * from "./header/types.js";
export type * from "./module/types.js";
export type * from "./operation-error/types.js";
export type * from "./operation-example/types.js";
export type * from "./operation/types.js";
export type * from "./schema/types.js";
export type * from "./state/types.js";
export type * from "./versioning/types.js";
export type ExtendedDocumentModelState = BaseState<
  DocumentModelState,
  DocumentModelLocalState
>;
export type DocumentModelDocument = BaseDocument<
  DocumentModelState,
  DocumentModelLocalState
>;

export type DocumentClassConstructor<
  TGlobalState,
  TLocalState,
  TAction extends Action,
> = abstract new (
  ...args: any[]
) => BaseDocumentClass<TGlobalState, TLocalState, TAction>;

// utils for safe mixin typing

export type AbstractConstructor<TInstance = object> = abstract new (
  ...args: any[]
) => TInstance;

// Given a base ctor, build a new ctor whose instances are BaseInstance & Augment
export type AugmentConstructor<
  TBase extends AbstractConstructor<any>,
  TAugment,
> = abstract new (
  ...a: ConstructorParameters<TBase>
) => InstanceType<TBase> & TAugment;
