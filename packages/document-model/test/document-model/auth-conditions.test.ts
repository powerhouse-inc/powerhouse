import type {
  AuthRequest,
  Condition,
  ConditionContext,
  Grant,
  PHAuthState,
} from "@powerhousedao/shared/document-model";
import {
  evaluate,
  evaluateCondition,
} from "@powerhousedao/shared/document-model";

const execGlobal: AuthRequest = {
  verb: "execute",
  scope: "global",
  operation: "SET_STATUS",
};

const ctx = (scopeState: unknown, actionInput?: unknown): ConditionContext => ({
  scopeState,
  actionInput,
});

function evalCond(
  condition: Condition,
  options: {
    scopeState?: unknown;
    actionInput?: unknown;
    address?: string;
    request?: AuthRequest;
  } = {},
): boolean {
  return evaluateCondition(
    condition,
    { address: options.address },
    options.request ?? execGlobal,
    ctx(options.scopeState, options.actionInput),
  );
}

describe("operand resolution", () => {
  it("resolves doc paths against the executing scope's state only", () => {
    const condition: Condition = {
      eq: [{ attr: "doc.global.status" }, { lit: "OPEN" }],
    };
    expect(evalCond(condition, { scopeState: { status: "OPEN" } })).toBe(true);
    expect(evalCond(condition, { scopeState: { status: "CLOSED" } })).toBe(
      false,
    );
    // A path naming another scope never resolves.
    expect(
      evalCond(
        { eq: [{ attr: "doc.local.status" }, { lit: "OPEN" }] },
        { scopeState: { status: "OPEN" } },
      ),
    ).toBe(false);
  });

  it("resolves subject and action.input paths", () => {
    expect(
      evalCond(
        { eq: [{ attr: "subject.address" }, { lit: "0xabc" }] },
        { address: "0xabc" },
      ),
    ).toBe(true);
    expect(
      evalCond(
        { eq: [{ attr: "action.input.newStatus" }, { lit: "APPROVED" }] },
        { actionInput: { newStatus: "APPROVED" } },
      ),
    ).toBe(true);
  });

  it("yields undefined for missing paths, objects, and arrays: comparisons are false", () => {
    expect(
      evalCond(
        { eq: [{ attr: "doc.global.missing" }, { lit: "x" }] },
        { scopeState: {} },
      ),
    ).toBe(false);
    // resolves to an object
    expect(
      evalCond(
        { eq: [{ attr: "doc.global.nested" }, { lit: "x" }] },
        { scopeState: { nested: { a: 1 } } },
      ),
    ).toBe(false);
    // resolves to an array
    expect(
      evalCond(
        { eq: [{ attr: "doc.global.list" }, { lit: "x" }] },
        { scopeState: { list: [1] } },
      ),
    ).toBe(false);
    // ne with an unresolved side is also false, not true
    expect(
      evalCond(
        { ne: [{ attr: "doc.global.missing" }, { lit: "x" }] },
        { scopeState: {} },
      ),
    ).toBe(false);
  });

  it("does not traverse through arrays or scalars", () => {
    expect(
      evalCond(
        { eq: [{ attr: "doc.global.list.0" }, { lit: 1 }] },
        { scopeState: { list: [1] } },
      ),
    ).toBe(false);
    expect(
      evalCond(
        { eq: [{ attr: "doc.global.status.length" }, { lit: 4 }] },
        { scopeState: { status: "OPEN" } },
      ),
    ).toBe(false);
  });
});

describe("operators", () => {
  const state = { count: 5, name: "beta", flag: true, empty: null };

  it("eq and ne compare strictly within a type", () => {
    expect(evalCond({ eq: [{ lit: 1 }, { lit: 1 }] })).toBe(true);
    expect(evalCond({ eq: [{ lit: 1 }, { lit: "1" }] })).toBe(false);
    expect(evalCond({ eq: [{ lit: null }, { lit: null }] })).toBe(true);
    expect(evalCond({ ne: [{ lit: 1 }, { lit: 2 }] })).toBe(true);
    expect(evalCond({ ne: [{ lit: true }, { lit: true }] })).toBe(false);
  });

  it("orders numbers numerically and strings by code point", () => {
    expect(evalCond({ lt: [{ lit: 2 }, { lit: 10 }] })).toBe(true);
    expect(evalCond({ gte: [{ lit: 2 }, { lit: 2 }] })).toBe(true);
    expect(evalCond({ lt: [{ lit: "10" }, { lit: "2" }] })).toBe(true);
    // An astral code point sorts above a high BMP code unit.
    expect(evalCond({ lt: [{ lit: "｡" }, { lit: "\u{1F600}" }] })).toBe(true);
    // Mixed types never order.
    expect(evalCond({ lt: [{ lit: 1 }, { lit: "2" }] })).toBe(false);
    expect(evalCond({ gt: [{ lit: 1 }, { lit: "0" }] })).toBe(false);
    expect(evalCond({ lte: [{ lit: true }, { lit: true }] })).toBe(false);
  });

  it("in and notIn test list membership", () => {
    const status: Condition = {
      in: [{ attr: "doc.global.name" }, [{ lit: "alpha" }, { lit: "beta" }]],
    };
    expect(evalCond(status, { scopeState: state })).toBe(true);
    expect(
      evalCond(
        { notIn: [{ attr: "doc.global.name" }, [{ lit: "alpha" }]] },
        { scopeState: state },
      ),
    ).toBe(true);
    // An unresolved left side makes both false.
    expect(
      evalCond(
        { in: [{ attr: "doc.global.missing" }, [{ lit: "x" }]] },
        { scopeState: state },
      ),
    ).toBe(false);
    expect(
      evalCond(
        { notIn: [{ attr: "doc.global.missing" }, [{ lit: "x" }]] },
        { scopeState: state },
      ),
    ).toBe(false);
  });

  it("exists tests presence explicitly", () => {
    expect(
      evalCond({ exists: { attr: "doc.global.count" } }, { scopeState: state }),
    ).toBe(true);
    expect(
      evalCond(
        { exists: { attr: "doc.global.missing" } },
        { scopeState: state },
      ),
    ).toBe(false);
    // null is a present value
    expect(
      evalCond({ exists: { attr: "doc.global.empty" } }, { scopeState: state }),
    ).toBe(true);
  });

  it("combines with and, or, not", () => {
    const gated: Condition = {
      and: [
        { eq: [{ attr: "doc.global.flag" }, { lit: true }] },
        {
          or: [
            { gt: [{ attr: "doc.global.count" }, { lit: 3 }] },
            { eq: [{ attr: "doc.global.name" }, { lit: "nope" }] },
          ],
        },
      ],
    };
    expect(evalCond(gated, { scopeState: state })).toBe(true);
    expect(evalCond({ not: gated } as Condition, { scopeState: state })).toBe(
      false,
    );
    // Empty and/or have their identity values.
    expect(evalCond({ and: [] })).toBe(true);
    expect(evalCond({ or: [] })).toBe(false);
  });
});

describe("totality", () => {
  it("is false for malformed conditions, even under not", () => {
    expect(evalCond({} as never)).toBe(false);
    expect(evalCond({ eq: [{ lit: 1 }] } as never)).toBe(false);
    expect(evalCond({ frob: [] } as never)).toBe(false);
    expect(evalCond(null as never)).toBe(false);
    // A malformed child poisons `not` rather than widening it.
    expect(evalCond({ not: { frob: [] } } as never)).toBe(false);
    expect(evalCond({ not: null } as never)).toBe(false);
    expect(evalCond({ and: [{ frob: [] }] } as never)).toBe(false);
  });

  it("never resolves non-finite numbers from state", () => {
    expect(
      evalCond(
        { eq: [{ attr: "doc.global.n" }, { attr: "doc.global.n" }] },
        { scopeState: { n: Number.NaN } },
      ),
    ).toBe(false);
  });
});

describe("conditions in the grant stack", () => {
  const whereOpen: Grant = {
    id: "g-while-open",
    description: "execute while open",
    effect: "allow",
    principal: { anyone: true },
    capability: { can: "execute", scope: "global" },
    where: {
      notIn: [
        { attr: "doc.global.status" },
        [{ lit: "APPROVED" }, { lit: "REJECTED" }],
      ],
    },
  };

  const matchOwner: Grant = {
    id: "g-owner",
    description: "the rto reads their own statement",
    effect: "allow",
    principal: {
      match: {
        eq: [{ attr: "subject.address" }, { attr: "doc.global.rtoAddress" }],
      },
    },
    capability: { can: "execute", scope: "global" },
  };

  function policy(...grants: Grant[]): PHAuthState {
    return { version: 1, grants };
  }

  it("a where clause gates the grant on the executing scope's state", () => {
    const auth = policy(whereOpen);
    expect(
      evaluate(auth, {}, execGlobal, {}, ctx({ status: "PROCESSING" }))
        .decision,
    ).toBe("allow");
    expect(
      evaluate(auth, {}, execGlobal, {}, ctx({ status: "APPROVED" })).decision,
    ).toBe("deny");
  });

  it("a conditional grant never applies without a condition context", () => {
    const auth = policy(whereOpen);
    expect(evaluate(auth, {}, execGlobal, {}).decision).toBe("deny");
    expect(evaluate(auth, {}, execGlobal).decision).toBe("deny");
  });

  it("a match principal relates the subject to the document", () => {
    const auth = policy(matchOwner);
    const state = { rtoAddress: "0xOwner" };
    expect(
      evaluate(auth, { address: "0xOwner" }, execGlobal, {}, ctx(state))
        .decision,
    ).toBe("allow");
    expect(
      evaluate(auth, { address: "0xOther" }, execGlobal, {}, ctx(state))
        .decision,
    ).toBe("deny");
    // No context: the match principal never applies.
    expect(
      evaluate(auth, { address: "0xOwner" }, execGlobal, {}).decision,
    ).toBe("deny");
  });

  it("a conditional deny can freeze a terminal document", () => {
    const auth = policy(
      {
        id: "g-open",
        description: "anyone executes",
        effect: "allow",
        principal: { anyone: true },
        capability: { can: "execute", scope: "global" },
      },
      {
        id: "g-freeze",
        description: "frozen once terminal",
        effect: "deny",
        principal: { anyone: true },
        capability: {
          can: "execute",
          scope: "global",
          operation: ["SET_STATUS"],
        },
        where: {
          in: [{ attr: "doc.global.status" }, [{ lit: "APPROVED" }]],
        },
      },
    );

    expect(
      evaluate(auth, {}, execGlobal, {}, ctx({ status: "OPEN" })).decision,
    ).toBe("allow");
    const frozen = evaluate(
      auth,
      {},
      execGlobal,
      {},
      ctx({ status: "APPROVED" }),
    );
    expect(frozen).toEqual({
      decision: "deny",
      refusal: "denied-by-grant",
      grantId: "g-freeze",
    });
  });

  it("action input paths gate on what is being attempted", () => {
    const auth = policy({
      id: "g-input",
      description: "only small increments",
      effect: "allow",
      principal: { anyone: true },
      capability: { can: "execute", scope: "global" },
      where: { lte: [{ attr: "action.input.amount" }, { lit: 10 }] },
    });

    expect(
      evaluate(auth, {}, execGlobal, {}, ctx({}, { amount: 5 })).decision,
    ).toBe("allow");
    expect(
      evaluate(auth, {}, execGlobal, {}, ctx({}, { amount: 50 })).decision,
    ).toBe("deny");
  });
});
