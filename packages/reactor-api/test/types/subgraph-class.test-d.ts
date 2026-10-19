import { ph } from "document-model";
import { parse } from "graphql";
import { expectTypeOf } from "vitest";
import { BaseSubgraph } from "../../src/graphql/base-subgraph.js";
import type {
  RequestOf,
  SchemaBuilder,
  SubgraphCheck,
} from "../../src/graphql/subgraph-schema.js";
import type { Context, SubgraphClass } from "../../src/graphql/types.js";

type ShopContext = Context & { readonly shopId: string };
type EuContext = ShopContext & { readonly vatId: string };

export class InvoicesSubgraph extends BaseSubgraph<ShopContext> {
  static override readonly subgraphName = "invoices";

  static override getSchema(schema: SchemaBuilder<InvoicesSubgraph>) {
    return [
      schema.query("invoice", {
        returns: ph.String(),
        resolve: ({ subgraph, request }) => {
          expectTypeOf(request).toEqualTypeOf<ShopContext>();
          return `${request.shopId}:${subgraph.currency}`;
        },
      }),
    ];
  }

  readonly currency = "EUR";
}

expectTypeOf<RequestOf<InvoicesSubgraph>>().toEqualTypeOf<ShopContext>();
expectTypeOf<RequestOf<BaseSubgraph>>().toEqualTypeOf<Context>();
expectTypeOf<SubgraphCheck<typeof InvoicesSubgraph>>().toEqualTypeOf<true>();

abstract class ShopBase<
  TRequest extends ShopContext = ShopContext,
> extends BaseSubgraph<TRequest> {
  static override getSchema(schema: SchemaBuilder<ShopBase>) {
    return [
      schema.query("shop", {
        returns: ph.String(),
        resolve: ({ request }) => request.shopId,
      }),
    ];
  }

  // @ts-expect-error -- TS2302: a static member cannot see the class's TRequest; use the shared constraint.
  static typedByParameter(schema: SchemaBuilder<ShopBase<TRequest>>) {
    return schema;
  }
}

export class EuShop extends ShopBase<EuContext> {
  static override readonly subgraphName = "eu-shop";
  readonly region = "eu";
}

export class PlainShop extends ShopBase {
  static override readonly subgraphName = "plain-shop";
}

expectTypeOf<RequestOf<EuShop>>().toEqualTypeOf<EuContext>();
expectTypeOf<RequestOf<PlainShop>>().toEqualTypeOf<ShopContext>();
expectTypeOf<SubgraphCheck<typeof EuShop>>().toEqualTypeOf<true>();
expectTypeOf<SubgraphCheck<typeof PlainShop>>().toEqualTypeOf<true>();

export class Audited extends ShopBase {
  static override readonly subgraphName = "audited";

  static override getSchema(schema: SchemaBuilder<Audited>) {
    return [
      ...super.getSchema(schema),
      schema.query("audits", {
        returns: ph.Int(),
        resolve: ({ subgraph }) => subgraph.#audits,
      }),
    ];
  }

  #audits = 0;
}

expectTypeOf<SubgraphCheck<typeof Audited>>().toEqualTypeOf<true>();

class Unrelated extends BaseSubgraph {
  readonly unrelatedOnly = "x";
}

export class WrongClass extends BaseSubgraph {
  static override readonly subgraphName = "wrong-class";

  static override getSchema(schema: SchemaBuilder<Unrelated>) {
    return [
      schema.query("wrong", {
        returns: ph.String(),
        resolve: ({ subgraph }) => subgraph.unrelatedOnly,
      }),
    ];
  }
}

expectTypeOf<SubgraphCheck<typeof WrongClass>>().toEqualTypeOf<
  ["getSchema names the wrong class", Unrelated]
>();

function named<const TName extends string>(subgraphName: TName) {
  return class extends BaseSubgraph {
    static override readonly subgraphName = subgraphName;
  };
}

expectTypeOf<
  SubgraphCheck<ReturnType<typeof named<"contacts-search">>>
>().toEqualTypeOf<true>();
expectTypeOf<
  SubgraphCheck<ReturnType<typeof named<"v2">>>
>().toEqualTypeOf<true>();
expectTypeOf<
  SubgraphCheck<ReturnType<typeof named<"Invoices">>>
>().toEqualTypeOf<["subgraphName must be lowercase kebab-case", "Invoices"]>();
expectTypeOf<
  SubgraphCheck<ReturnType<typeof named<"foo--bar">>>
>().toEqualTypeOf<["subgraphName must be lowercase kebab-case", "foo--bar"]>();
expectTypeOf<SubgraphCheck<ReturnType<typeof named<"foo-">>>>().toEqualTypeOf<
  ["subgraphName must be lowercase kebab-case", "foo-"]
>();

export class Widened extends BaseSubgraph {
  static override readonly subgraphName: string = "Not-Checked";
}

expectTypeOf<SubgraphCheck<typeof Widened>>().toEqualTypeOf<true>();

// @ts-expect-error -- TS2417: '"renamed"' is not assignable to '"invoices"'.
export class RenamedInvoices extends InvoicesSubgraph {
  static override readonly subgraphName = "renamed";
}

export class RenamedWidened extends Widened {
  static override readonly subgraphName: string = "renamed-widened";
}

// @ts-expect-error -- TS2417: the mixed array is not a SubgraphSchema.
export class Mixed extends BaseSubgraph {
  static override readonly subgraphName = "mixed";

  static override getSchema(schema: SchemaBuilder<Mixed>) {
    return [
      schema.query("a", { returns: ph.Int(), resolve: () => 1 }),
      schema.graphql({
        typeDefs: parse("type Query { b: Int }"),
        resolverCoordinates: [],
        resolvers: () => ({}),
      }),
    ];
  }
}

export class SdlShop extends BaseSubgraph<ShopContext> {
  static override readonly subgraphName = "sdl-shop";

  static override getSchema(schema: SchemaBuilder<SdlShop>) {
    return schema.graphql({
      typeDefs: parse("type Query { shop: String }"),
      resolverCoordinates: [
        { typeName: "Query", fieldName: "shop", resolverKind: "field" },
      ],
      resolvers: (subgraph) => {
        expectTypeOf(subgraph).toEqualTypeOf<SdlShop>();
        return {
          Query: {
            shop: (_parent, _args, request) => {
              expectTypeOf(request).toEqualTypeOf<ShopContext>();
              return `${request.shopId}:${subgraph.label}`;
            },
          },
        };
      },
    });
  }

  readonly label = "sdl";
}

expectTypeOf<SubgraphCheck<typeof SdlShop>>().toEqualTypeOf<true>();

function readableDocument(schema: SchemaBuilder<BaseSubgraph>) {
  return schema.query("readable", {
    args: { id: ph.String({ required: true }) },
    returns: ph.Boolean(),
    resolve: ({ args, subgraph, request }) =>
      subgraph.servesDocument(args.id, request),
  });
}

export class Fragmented extends BaseSubgraph {
  static override readonly subgraphName = "fragmented";

  static override getSchema(schema: SchemaBuilder<Fragmented>) {
    return [readableDocument(schema)];
  }
}

export const registrable: SubgraphClass[] = [InvoicesSubgraph, EuShop, SdlShop];
