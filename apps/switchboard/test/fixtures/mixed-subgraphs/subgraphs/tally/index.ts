import { type SchemaBuilder, Subgraph } from "@powerhousedao/reactor-api";
import { ph } from "document-model";

const Tally = ph.object("Tally", {
  fields: {
    id: ph.ID({ required: true }),
    count: ph.Int({ required: true }),
  },
});

type TallyRecord = { id: string; count: number };

export class TallySubgraph extends Subgraph {
  static override readonly subgraphName = "tally";

  readonly #tallies = new Map<string, number>();
  readonly #listeners = new Set<() => void>();

  static override getSchema(schema: SchemaBuilder<TallySubgraph>) {
    return [
      schema.query("tally", {
        args: { id: ph.ID({ required: true }) },
        type: ph.ref(Tally, { required: true }),
        resolve: ({ args, subgraph }) => subgraph.#read(args.id),
      }),
      schema.mutation("incrementTally", {
        args: {
          id: ph.ID({ required: true }),
          by: ph.Int({ required: true }),
        },
        type: ph.ref(Tally, { required: true }),
        resolve: ({ args, subgraph }) => subgraph.#increment(args.id, args.by),
      }),
      schema.field(Tally, "doubled", {
        type: ph.Int({ required: true }),
        resolve: ({ parent }) => parent.count * 2,
      }),
      schema.subscription("tallyChanged", {
        args: { id: ph.ID({ required: true }) },
        type: ph.ref(Tally, { required: true }),
        subscribe: ({ args, subgraph }) => subgraph.#watch(args.id),
        resolve: ({ parent }) => parent,
      }),
    ];
  }

  #read(id: string): TallyRecord {
    return { id, count: this.#tallies.get(id) ?? 0 };
  }

  #increment(id: string, by: number): TallyRecord {
    this.#tallies.set(id, this.#read(id).count + by);
    for (const notify of this.#listeners) notify();
    return this.#read(id);
  }

  /** The tally now, then again after each change. */
  async *#watch(id: string): AsyncGenerator<TallyRecord> {
    let changed = Promise.resolve();
    let notify = () => {};
    const listener = () => notify();
    this.#listeners.add(listener);
    try {
      for (;;) {
        await changed;
        changed = new Promise<void>((resolve) => (notify = resolve));
        yield this.#read(id);
      }
    } finally {
      this.#listeners.delete(listener);
    }
  }
}
