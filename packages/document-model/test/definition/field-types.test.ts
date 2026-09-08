import { describe, expectTypeOf, it } from "vitest";
import { ph } from "../../index.js";
import type {
  InputOf,
  OutputOf,
  SourceOf,
} from "../../src/definition/types.js";

describe("ph type inference", () => {
  it("infers scalar and recursive-list nullability", () => {
    const _optional = ph.String();
    const _required = ph.String({ required: true });
    const _nested = ph.list(ph.list(ph.Int({ required: true })), {
      required: true,
    });

    expectTypeOf<OutputOf<typeof _optional>>().toEqualTypeOf<
      string | null | undefined
    >();
    expectTypeOf<OutputOf<typeof _required>>().toEqualTypeOf<string>();
    expectTypeOf<OutputOf<typeof _nested>>().toEqualTypeOf<
      readonly (readonly number[] | null | undefined)[]
    >();
  });

  it("separates input, output, and resolver backing object shapes", () => {
    const _RecordType = ph.object("Record", {
      fields: {
        id: ph.ID({ required: true }),
        note: ph.String(),
        computed: ph.field({ returns: ph.Int({ required: true }) }),
      },
    });

    expectTypeOf<OutputOf<typeof _RecordType>>().toEqualTypeOf<{
      id: string;
      note: string | null | undefined;
      computed: number;
    }>();
    expectTypeOf<SourceOf<typeof _RecordType>>().toEqualTypeOf<{
      id: string;
      note: string | null | undefined;
    }>();
  });

  it("makes only nullable input fields optional properties", () => {
    const _Input = ph.input("UpdateInput", {
      fields: {
        id: ph.ID({ required: true }),
        note: ph.String(),
      },
    });

    expectTypeOf<InputOf<typeof _Input>>().toEqualTypeOf<
      { id: string } & { note?: string | null | undefined }
    >();
  });

  it("rejects named types in field-use positions at compile time", () => {
    const Status = ph.enum("Status", ["OPEN", "CLOSED"] as const);
    const Node = ph.object("Node", { fields: { id: ph.ID() } });
    const StatusField = ph.ref(Status);

    ph.object("Good", { fields: { status: StatusField } });
    ph.union("GoodUnion", { members: [Node] });

    function _compileTimeFailures() {
      ph.object("Bad", {
        fields: {
          // @ts-expect-error named types must be wrapped with ph.ref
          status: Status,
        },
      });
      // @ts-expect-error union members must be named object types
      ph.union("BadUnion", { members: [ph.String()] });
      // @ts-expect-error references cannot target field uses
      ph.ref(StatusField);
      // @ts-expect-error list items must be field uses
      ph.list(Node);
      // @ts-expect-error required is the only field validation option
      ph.String({ minLength: 1 });
      ph.object("UncalledFactory", {
        fields: {
          // @ts-expect-error scalar factories must be called
          title: ph.String,
        },
      });
    }
    expectTypeOf(_compileTimeFailures).toBeFunction();
  });
});
