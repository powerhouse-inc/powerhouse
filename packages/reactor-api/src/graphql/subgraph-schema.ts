import type { IResolvers } from "@graphql-tools/utils";
import type { ResolverCoordinateDefinition } from "@powerhousedao/shared/document-model";
import type {
  SdlSchema,
  SubgraphSchema,
  SubgraphSchemaBuilders,
} from "document-model/tooling";
import type {
  DocumentNode,
  GraphQLAbstractType,
  GraphQLResolveInfo,
} from "graphql";
import type { BaseSubgraph } from "./base-subgraph.js";

export type { SdlSchema, SubgraphSchema };

export type ResolverCoordinate = ResolverCoordinateDefinition;

/**
 * The key of `BaseSubgraph`'s type-only request witness, which carries
 * `TRequest` from the class to `RequestOf`. Nothing is ever stored under it.
 */
export const requestType: unique symbol = Symbol("requestType");

/** The request (GraphQL context) type a subgraph class declares. */
export type RequestOf<T> =
  T extends BaseSubgraph<infer TRequest> ? TRequest : never;

/**
 * What a class's static `getSchema` is handed. `T` is the class whose
 * instance every resolver receives as `subgraph`.
 */
export type SchemaBuilder<T extends BaseSubgraph<any>> = SubgraphSchemaBuilders<
  T,
  RequestOf<T>,
  GraphQLResolveInfo,
  GraphQLAbstractType,
  DocumentNode,
  IResolvers<unknown, RequestOf<T>>
>;

type KebabCaseCharacter =
  | "a"
  | "b"
  | "c"
  | "d"
  | "e"
  | "f"
  | "g"
  | "h"
  | "i"
  | "j"
  | "k"
  | "l"
  | "m"
  | "n"
  | "o"
  | "p"
  | "q"
  | "r"
  | "s"
  | "t"
  | "u"
  | "v"
  | "w"
  | "x"
  | "y"
  | "z"
  | "0"
  | "1"
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "8"
  | "9";

type IsKebabCase<S extends string> = S extends `${infer Head}${infer Rest}`
  ? Head extends KebabCaseCharacter
    ? Rest extends ""
      ? true
      : Rest extends `-${infer Next}`
        ? IsKebabCase<Next>
        : IsKebabCase<Rest>
    : false
  : false;

type NameCheck<TName> = string extends TName
  ? true
  : TName extends string
    ? IsKebabCase<TName> extends true
      ? true
      : ["subgraphName must be lowercase kebab-case", TName]
    : true;

type SchemaTarget<C> = C extends {
  getSchema(schema: SchemaBuilder<infer T>): unknown;
}
  ? T
  : never;

type SchemaCheck<C extends abstract new (...args: any[]) => BaseSubgraph<any>> =
  [InstanceType<C>] extends [SchemaTarget<C>]
    ? true
    : ["getSchema names the wrong class", SchemaTarget<C>];

/**
 * `true` when the class's literal `subgraphName` is lowercase kebab-case and
 * its `getSchema` builder names a class its instances satisfy; otherwise a
 * tuple that names the problem. Method bivariance hides a wrong builder class
 * from the ordinary override check, so this is checked separately:
 *
 * ```ts
 * const check: SubgraphCheck<typeof InvoicesSubgraph> = true;
 * ```
 *
 * Type-only. A name widened to `string` is checked when the class is
 * described.
 */
export type SubgraphCheck<
  C extends abstract new (...args: any[]) => BaseSubgraph<any>,
> =
  NameCheck<
    C extends { readonly subgraphName: infer TName } ? TName : undefined
  > extends infer TNameResult
    ? TNameResult extends true
      ? SchemaCheck<C>
      : TNameResult
    : never;
