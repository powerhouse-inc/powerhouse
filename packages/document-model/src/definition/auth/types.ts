import type { DefinitionDiagnostic } from "@powerhousedao/shared/document-model";
import type { z } from "zod";
import type { authPlatformCatalog } from "./platform.js";
import type {
  Action,
  Actions,
  AuthAddress,
  AuthGroupId,
  InitialAuthBindingDefinition,
  InitialAuthTemplate,
  PHBaseState,
  PHAuthState,
} from "@powerhousedao/shared/document-model";
import type { ModelModuleToken } from "../model/types.js";

export type AuthScope = "global" | "local" | "auth" | "document" | "header";
export type AuthPrimitive = string | number | boolean | null;
declare const authValueType: unique symbol;
declare const authOperationType: unique symbol;
declare const authTargetType: unique symbol;
declare const authBindingType: unique symbol;
declare const initialAuthType: unique symbol;
declare const authTokenType: unique symbol;

export interface AuthValue<T = unknown> {
  readonly [authValueType]: T;
}

/** Optional parents produce missing descendants, not values from default parsing. */
export type AuthFields<T> = AuthValue<T> &
  (NonNullable<T> extends readonly unknown[]
    ? unknown
    : NonNullable<T> extends object
      ? {
          readonly [K in keyof NonNullable<T>]-?: AuthFields<
            | NonNullable<T>[K]
            | (null extends T ? undefined : never)
            | (undefined extends T ? undefined : never)
          >;
        }
      : unknown);

export interface AuthOperation<
  TScope extends AuthScope = AuthScope,
  TInput = unknown,
> {
  readonly kind: "powerhouse.auth-operation";
  readonly [authOperationType]: {
    readonly scope: TScope;
    readonly input: TInput;
  };
}
export interface AuthScopeReference<TScope extends AuthScope = AuthScope> {
  readonly kind: "powerhouse.auth-scope";
  readonly [authTokenType]: "scope";
  readonly scope: TScope;
}
export interface AuthTarget<
  TScope extends AuthScope = AuthScope,
  TInput = never,
> {
  readonly kind: "powerhouse.auth-target";
  readonly [authTargetType]: {
    readonly scope: TScope;
    readonly input: TInput;
  };
}
export interface AuthCondition {
  readonly kind: "powerhouse.auth-condition";
  readonly [authTokenType]: "condition";
}
export interface AuthPrincipal {
  readonly kind: "powerhouse.auth-principal";
  readonly [authTokenType]: "principal";
}
export interface AuthBinding<
  TKind extends InitialAuthBindingDefinition["kind"] =
    InitialAuthBindingDefinition["kind"],
  TSource extends InitialAuthBindingDefinition["source"] =
    InitialAuthBindingDefinition["source"],
> {
  readonly kind: "powerhouse.auth-binding";
  readonly [authBindingType]: {
    readonly kind: TKind;
    readonly source: TSource;
  };
}
export type AuthBindings = Readonly<Record<string, AuthBinding>>;
export interface AuthGrant {
  readonly kind: "powerhouse.auth-grant";
  readonly [authTokenType]: "grant";
}
export interface InitialAuthDeclaration<
  TBindings extends AuthBindings = AuthBindings,
> {
  readonly kind: "powerhouse.initial-auth";
  readonly [initialAuthType]: TBindings;
}

export type BindingValues<
  TBindings extends AuthBindings,
  TSource extends InitialAuthBindingDefinition["source"],
> = {
  readonly [
    K in keyof TBindings as TBindings[K] extends AuthBinding<
      InitialAuthBindingDefinition["kind"],
      TSource
    >
      ? string extends K
        ? never
        : K
      : never
  ]: TBindings[K] extends AuthBinding<"address"> ? AuthAddress : AuthGroupId;
};
export type InitialAuthBindingValues<TBindings extends AuthBindings> = {
  readonly deployment: BindingValues<TBindings, "deployment">;
  readonly instance: BindingValues<TBindings, "instance">;
};

export interface InitialAuthRuntime<
  TBindings extends AuthBindings = AuthBindings,
> {
  readonly template: InitialAuthTemplate;
  readonly diagnostics: readonly DefinitionDiagnostic[];
  resolve(bindings: InitialAuthBindingValues<TBindings>): PHAuthState;
}

/** Binding keys and value kinds survive version definitions, modules and families. */
export type InitialAuthBindings<T> = T extends {
  readonly initialAuth: InitialAuthRuntime<infer B>;
}
  ? InitialAuthBindingValues<B>
  : T extends { readonly initialAuthDeclaration?: infer Declaration }
    ? [NonNullable<Declaration>] extends [never]
      ? never
      : NonNullable<Declaration> extends InitialAuthDeclaration<infer B>
        ? InitialAuthBindingValues<B>
        : never
    : never;

export type AuthOperationCatalog<TModules extends readonly ModelModuleToken[]> =
  {
    readonly [
      M in TModules[number] as M extends ModelModuleToken<
        PHBaseState,
        Actions,
        infer K
      >
        ? string extends K
          ? never
          : K
        : never
    ]: M extends ModelModuleToken<PHBaseState, infer A, string>
      ? {
          readonly [
            K in keyof A as string extends K ? never : K
          ]: A[K] extends (...args: never[]) => infer R
            ? R extends Action & {
                scope: infer S extends AuthScope;
                input: infer I;
              }
              ? AuthOperation<S, I>
              : never
            : never;
        }
      : never;
  };

export type AuthPlatformOperations = {
  readonly [S in keyof typeof authPlatformCatalog]: {
    readonly [
      K in keyof (typeof authPlatformCatalog)[S]
    ]: (typeof authPlatformCatalog)[S][K] extends {
      input: infer Z extends z.ZodType;
    }
      ? AuthOperation<S, z.input<Z>>
      : never;
  };
};

type TargetScope<T> = T extends AuthTarget<infer S, unknown> ? S : never;
type TargetInput<T> = T extends AuthTarget<AuthScope, infer I> ? I : never;
export type AuthConditionContext<
  TState extends PHBaseState,
  TTarget extends AuthTarget<AuthScope, unknown>,
> = {
  readonly subject: {
    readonly address: AuthValue<string | undefined>;
    readonly key: AuthValue<string | undefined>;
  };
} & (TargetScope<TTarget> extends "header"
  ? unknown
  : {
      readonly state: AuthFields<TState[TargetScope<TTarget> & keyof TState]>;
    }) &
  ([TargetInput<TTarget>] extends [never]
    ? unknown
    : { readonly input: AuthFields<TargetInput<TTarget>> });

type GrantDeclaration<
  TState extends PHBaseState,
  TTarget extends AuthTarget<AuthScope, unknown>,
> = {
  readonly id: string;
  readonly description: string;
  readonly principal:
    | AuthPrincipal
    | AuthBinding
    | ((context: AuthConditionContext<TState, TTarget>) => AuthCondition);
  readonly target: TTarget;
  readonly where?: (
    context: AuthConditionContext<TState, TTarget>,
  ) => AuthCondition;
};
type Comparable<T> = AuthValue<NoInfer<T>> | Exclude<NoInfer<T>, undefined>;
type Ordered<T> = [Exclude<T, null | undefined>] extends [string] | [number]
  ? AuthValue<T>
  : never;

export interface AuthPolicyBuilder<TState extends PHBaseState> {
  addressBinding<
    const S extends InitialAuthBindingDefinition["source"],
  >(options: {
    readonly source: S;
  }): AuthBinding<"address", S>;
  groupBinding<
    const S extends InitialAuthBindingDefinition["source"],
  >(options: {
    readonly source: S;
  }): AuthBinding<"group", S>;
  bindings<const B extends AuthBindings>(bindings: B): B;
  initial<const B extends AuthBindings>(config: {
    readonly version: 1;
    readonly bindings: B;
    readonly grants: readonly AuthGrant[];
  }): InitialAuthDeclaration<B>;
  anyone(): AuthPrincipal;
  address(address: AuthAddress): AuthPrincipal;
  group(group: AuthGroupId): AuthPrincipal;
  read<S extends AuthScope>(scope: AuthScopeReference<S>): AuthTarget<S>;
  execute<S extends AuthScope, I>(
    operation: AuthOperation<S, I>,
  ): AuthTarget<S, I>;
  executeMany<S extends AuthScope>(
    operations: readonly [AuthOperation<S>, ...AuthOperation<NoInfer<S>>[]],
  ): AuthTarget<S>;
  allOperations<S extends AuthScope>(
    scope: AuthScopeReference<S>,
  ): AuthTarget<S>;
  allow<const T extends AuthTarget<AuthScope, unknown>>(
    grant: GrantDeclaration<TState, T>,
  ): AuthGrant;
  deny<const T extends AuthTarget<AuthScope, unknown>>(
    grant: GrantDeclaration<TState, T>,
  ): AuthGrant;
  eq<T extends AuthPrimitive | undefined>(
    left: AuthValue<T>,
    right: Comparable<T>,
  ): AuthCondition;
  ne<T extends AuthPrimitive | undefined>(
    left: AuthValue<T>,
    right: Comparable<T>,
  ): AuthCondition;
  in<T extends AuthPrimitive | undefined>(
    left: AuthValue<T>,
    right: readonly Comparable<T>[],
  ): AuthCondition;
  notIn<T extends AuthPrimitive | undefined>(
    left: AuthValue<T>,
    right: readonly Comparable<T>[],
  ): AuthCondition;
  lt<T extends AuthPrimitive | undefined>(
    left: Ordered<T>,
    right: Comparable<Exclude<T, null | undefined>>,
  ): AuthCondition;
  lte<T extends AuthPrimitive | undefined>(
    left: Ordered<T>,
    right: Comparable<Exclude<T, null | undefined>>,
  ): AuthCondition;
  gt<T extends AuthPrimitive | undefined>(
    left: Ordered<T>,
    right: Comparable<Exclude<T, null | undefined>>,
  ): AuthCondition;
  gte<T extends AuthPrimitive | undefined>(
    left: Ordered<T>,
    right: Comparable<Exclude<T, null | undefined>>,
  ): AuthCondition;
  exists(value: AuthValue): AuthCondition;
  and(...conditions: readonly AuthCondition[]): AuthCondition;
  or(...conditions: readonly AuthCondition[]): AuthCondition;
  not(condition: AuthCondition): AuthCondition;
}

export type InitialAuthContext<
  TState extends PHBaseState,
  TModules extends readonly ModelModuleToken[],
> = {
  readonly operations: AuthOperationCatalog<TModules>;
  readonly scopes: { readonly [S in AuthScope]: AuthScopeReference<S> };
  readonly platform: AuthPlatformOperations;
  readonly policy: AuthPolicyBuilder<TState>;
};
