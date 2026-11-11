/**
 * Type-level contract of the code-first authoring API, checked by tsc over
 * the test sources. The runtime assertions only keep the file a test.
 */
import { ph } from "document-model";
import type { GraphQLResolveInfo } from "graphql";
import { describe, expect, expectTypeOf, it } from "vitest";
import {
  BaseSubgraph,
  type Context,
  type SchemaBuilder,
  Subgraph,
  type SubgraphSchemaEntry,
} from "../index.mjs";

const Status = ph.enum("TypeTestStatus", { values: ["OPEN", "CLOSED"] });
const Ticket = ph.object("TypeTestTicket", {
  fields: {
    id: ph.OID({ required: true }),
    status: ph.ref(Status, { required: true }),
    note: ph.String(),
  },
});
const Notice = ph.object("TypeTestNotice", {
  fields: { text: ph.String({ required: true }) },
});
const Alert = ph.object("TypeTestAlert", {
  fields: { level: ph.Int({ required: true }) },
});
const Item = ph.union("TypeTestItem", { members: [Notice, Alert] });
const TicketFilter = ph.input("TypeTestTicketFilter", {
  fields: {
    status: ph.ref(Status),
    first: ph.Int({ required: true, defaultValue: 10 }),
  },
});

class Tickets extends Subgraph {
  static override readonly subgraphName = "tickets";
  readonly #secret = 42;

  static override getSchema(schema: SchemaBuilder<Tickets>) {
    const ticketOpened = {
      type: ph.ref(Ticket, { required: true }),
      subscribe: async function* () {
        yield await Promise.resolve({ id: "t-1", status: "OPEN" as const });
      },
    };
    return [
      schema.query("tickets", {
        args: { filter: ph.ref(TicketFilter, { required: true }) },
        type: ph.list(ph.ref(Ticket, { required: true }), { required: true }),
        resolve: ({ args, parent, request, info, subgraph }) => {
          expectTypeOf(parent).toEqualTypeOf<undefined>();
          expectTypeOf(args.filter.first).toEqualTypeOf<number>();
          expectTypeOf(args.filter.status).toEqualTypeOf<
            "OPEN" | "CLOSED" | null | undefined
          >();
          expectTypeOf(request).toEqualTypeOf<Context>();
          expectTypeOf(info).toEqualTypeOf<GraphQLResolveInfo>();
          expectTypeOf(subgraph).toEqualTypeOf<Tickets>();
          // Protected helpers and #private members, inside the class body.
          expectTypeOf(subgraph.viewSubject(request).address).toEqualTypeOf<
            string | undefined
          >();
          expectTypeOf(subgraph.#secret).toEqualTypeOf<number>();
          return [];
        },
      }),
      schema.query("ticket", {
        args: { id: ph.OID({ required: true }) },
        type: ph.ref(Ticket),
        resolve: ({ args }) => ({
          id: args.id,
          status: "OPEN" as const,
          note: null,
        }),
      }),
      schema.query("lostTicket", {
        type: ph.ref(Ticket),
        // @ts-expect-error -- a status outside the enum is not a ticket.
        resolve: () => ({ id: "t-1", status: "LOST" as const, note: null }),
      }),
      schema.field(Ticket, "summary", {
        type: ph.String({ required: true }),
        resolve: ({ parent }) => {
          expectTypeOf(parent.status).toEqualTypeOf<"OPEN" | "CLOSED">();
          return `${parent.id}: ${parent.status}`;
        },
      }),
      // @ts-expect-error -- events without `resolve` carry the field's name.
      schema.subscription("ticketOpened", ticketOpened),
      schema.subscription("ticketCount", {
        type: ph.Int({ required: true }),
        subscribe: async function* () {
          yield await Promise.resolve(1);
        },
        resolve: ({ parent }) => {
          expectTypeOf(parent).toEqualTypeOf<number>();
          return parent;
        },
      }),
      schema.resolveType(Item, ({ value }) => {
        expectTypeOf(value).toEqualTypeOf<
          { text: string } | { level: number }
        >();
        return "text" in value ? "TypeTestNotice" : "TypeTestAlert";
      }),
    ];
  }
}

class OutsideTheBody {
  static schema(schema: SchemaBuilder<Tickets>) {
    return schema.query("x", {
      type: ph.String(),
      resolve: ({ subgraph, request }) =>
        // @ts-expect-error -- protected outside the class body.
        subgraph.viewSubject(request).address,
    });
  }
}

describe("code-first authoring types", () => {
  it("types the statics on Subgraph only", () => {
    expectTypeOf(Tickets.subgraphName).toEqualTypeOf<string>();
    expectTypeOf<typeof Subgraph.subgraphName>().toEqualTypeOf<string>();
    expectTypeOf(Tickets.getSchema)
      .parameter(0)
      .toEqualTypeOf<SchemaBuilder<Tickets>>();
    expectTypeOf(Subgraph.getSchema).returns.toEqualTypeOf<
      readonly SubgraphSchemaEntry<never>[]
    >();
    expectTypeOf(Tickets.getSchema).returns.toExtend<
      readonly SubgraphSchemaEntry<never>[]
    >();
    // @ts-expect-error -- BaseSubgraph carries no code-first statics.
    void BaseSubgraph.getSchema;
    // @ts-expect-error -- nor a subgraphName.
    void BaseSubgraph.subgraphName;
    expect(OutsideTheBody.schema).toBeTypeOf("function");
  });

  it("keeps an entry built for one subgraph out of another's schema", () => {
    class Other extends Subgraph {
      readonly other = true;
    }
    expectTypeOf<SubgraphSchemaEntry<Tickets>>().not.toExtend<
      SubgraphSchemaEntry<Other>
    >();
    expectTypeOf<SubgraphSchemaEntry<Subgraph>>().toExtend<
      SubgraphSchemaEntry<Tickets>
    >();
  });
});
