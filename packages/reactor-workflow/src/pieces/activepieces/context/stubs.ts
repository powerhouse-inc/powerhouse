export class UnsupportedContextMemberError extends Error {
  readonly member: string;

  constructor(member: string) {
    super(
      `Piece used unimplemented context member "${member}". ` +
        `Implement it in the adapter or reject the piece at conformance time.`,
    );
    this.name = "UnsupportedContextMemberError";
    this.member = member;
  }
}

// Traps calls and member reads so both `ctx.files.write(...)` and
// `ctx.server.apiUrl` throw with the full member path.
export function throwingStub(memberPath: string): unknown {
  return new Proxy(function stub() {}, {
    get(_target, prop) {
      // `then` and symbols stay inert so `await`/inspection don't false-trip.
      if (typeof prop !== "string" || prop === "then") return undefined;
      throw new UnsupportedContextMemberError(`${memberPath}.${prop}`);
    },
    apply() {
      throw new UnsupportedContextMemberError(memberPath);
    },
  });
}

// Wraps a context object so every top-level read is recorded; reads of
// members outside the documented surface are flagged as UNDOCUMENTED.
export function withTouchTracking<T extends object>(
  base: T,
  touched: Set<string>,
  onTouch?: (member: string) => void,
): T {
  return new Proxy(base, {
    get(target, prop, receiver) {
      if (typeof prop === "string" && prop !== "then") {
        const member = prop in target ? prop : `UNDOCUMENTED:${prop}`;
        touched.add(member);
        onTouch?.(member);
      }
      return Reflect.get(target, prop, receiver) as unknown;
    },
  });
}
