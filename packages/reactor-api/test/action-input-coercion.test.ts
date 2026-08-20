import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { GraphQLInputObjectType } from "graphql";
import { buildSchema, coerceInputValue } from "graphql";
import { describe, expect, it } from "vitest";

// The SDL is the contract a client is coerced against, so these assert against
// it directly rather than against the generated types, which cannot reject
// anything at runtime.
const schema = buildSchema(
  readFileSync(
    join(
      dirname(fileURLToPath(import.meta.url)),
      "../src/graphql/reactor/schema.graphql",
    ),
    "utf8",
  ),
);

const actionInput = schema.getType("ActionInput") as GraphQLInputObjectType;

/** The coercion errors an input earns, by path. */
function coercionErrors(value: unknown): string[] {
  const errors: string[] = [];
  coerceInputValue(value, actionInput, (path, _invalidValue, error) => {
    errors.push(`${path.join(".")}: ${error.message}`);
  });
  return errors;
}

const action = {
  id: "act-1",
  type: "SET_NAME",
  timestampUtcMs: "2026-01-01T00:00:00.000Z",
  input: { name: "x" },
  scope: "global",
};

const signer = {
  user: { address: "0x1", networkId: "eip155", chainId: 1 },
  app: { name: "Connect", key: "did:key:z6Mk" },
  signatures: [],
};

describe("the action a client is coerced against", () => {
  it("accepts a plain action", () => {
    expect(coercionErrors(action)).toEqual([]);
  });

  it("accepts an action stamped with the head it applies to", () => {
    // stampAction puts both of these on every action the browser client pushes,
    // so an input object that does not declare them refuses every dispatch.
    expect(
      coercionErrors({
        ...action,
        context: { prevOpHash: "deadbeef", prevOpIndex: 3 },
      }),
    ).toEqual([]);
  });

  it("accepts a stamped, signed action", () => {
    expect(
      coercionErrors({
        ...action,
        context: {
          prevOpHash: "deadbeef",
          prevOpIndex: 3,
          signer: { ...signer, signatures: ["a, b, c, d, e"] },
        },
      }),
    ).toEqual([]);
  });

  it("accepts a nonce", () => {
    expect(coercionErrors({ ...action, context: { nonce: "n" } })).toEqual([]);
  });

  it("refuses an action with no id", () => {
    const { id: _id, ...withoutId } = action;
    const errors = coercionErrors(withoutId);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('Field "id" of required type "String!"');
  });

  it("refuses a null id", () => {
    const errors = coercionErrors({ ...action, id: null });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("id");
    expect(errors[0]).toContain("not to be null");
  });

  it("refuses an action with no timestamp", () => {
    const { timestampUtcMs: _ts, ...withoutTimestamp } = action;
    const errors = coercionErrors(withoutTimestamp);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain(
      'Field "timestampUtcMs" of required type "String!"',
    );
  });

  it("refuses a field the context does not declare", () => {
    // The guarantee that keeps this input honest: a runtime-only field cannot
    // ride along and be persisted unnoticed.
    const errors = coercionErrors({
      ...action,
      context: { resultingState: "{}" },
    });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain(
      'Field "resultingState" is not defined by type "ActionContextInput"',
    );
  });
});
