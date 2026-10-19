// Upstream's Property, with the resolver context a Powerhouse host serves:
// `ctx.reactor`, read-only at design time whatever the block declares.
import {
  Property as UpstreamProperty,
  type PieceAuthProperty,
  type PropertyContext as UpstreamPropertyContext,
} from "../../upstream/framework/index.js";
import type { ReactorReadClient } from "./reactor-client.js";

type AnyPieceAuth = PieceAuthProperty | PieceAuthProperty[] | undefined;

// Absent when the block declares no requireReactor, or the host serves none.
export type PropertyContext = UpstreamPropertyContext & {
  reactor?: ReactorReadClient;
};

type WithReactorResolver<F> = F extends (
  values: infer V,
  ctx: UpstreamPropertyContext,
) => infer Out
  ? (values: V, ctx: PropertyContext) => Out
  : F;

type WithReactorResolvers<Params, Key extends PropertyKey> = {
  [K in keyof Params]: K extends Key
    ? WithReactorResolver<Params[K]>
    : Params[K];
};

type DropdownParams<T, R extends boolean, A extends AnyPieceAuth> = Parameters<
  typeof UpstreamProperty.Dropdown<T, R, A>
>[0];
type MultiSelectDropdownParams<
  T,
  R extends boolean,
  A extends AnyPieceAuth,
> = Parameters<typeof UpstreamProperty.MultiSelectDropdown<T, R, A>>[0];
type DynamicPropertiesParams<
  R extends boolean,
  A extends AnyPieceAuth,
> = Parameters<typeof UpstreamProperty.DynamicProperties<R, A>>[0];

export const Property = {
  ...UpstreamProperty,
  Dropdown<T, R extends boolean = boolean, A extends AnyPieceAuth = undefined>(
    request: WithReactorResolvers<DropdownParams<T, R, A>, "options">,
  ): ReturnType<typeof UpstreamProperty.Dropdown<T, R, A>> {
    return UpstreamProperty.Dropdown<T, R, A>(
      request as unknown as DropdownParams<T, R, A>,
    );
  },
  MultiSelectDropdown<
    T,
    R extends boolean = boolean,
    A extends AnyPieceAuth = undefined,
  >(
    request: WithReactorResolvers<
      MultiSelectDropdownParams<T, R, A>,
      "options"
    >,
  ): ReturnType<typeof UpstreamProperty.MultiSelectDropdown<T, R, A>> {
    return UpstreamProperty.MultiSelectDropdown<T, R, A>(
      request as unknown as MultiSelectDropdownParams<T, R, A>,
    );
  },
  DynamicProperties<
    R extends boolean = boolean,
    A extends AnyPieceAuth = undefined,
  >(
    request: WithReactorResolvers<DynamicPropertiesParams<R, A>, "props">,
  ): ReturnType<typeof UpstreamProperty.DynamicProperties<R, A>> {
    return UpstreamProperty.DynamicProperties<R, A>(
      request as unknown as DynamicPropertiesParams<R, A>,
    );
  },
};
