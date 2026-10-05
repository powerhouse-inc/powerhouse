import type {
  Action,
  DocumentModelModule,
  PHBaseState,
  PHDocument,
  PowerhouseScalarName,
} from "@powerhousedao/shared/document-model";
import { describe, expect, it } from "vitest";
import type { z } from "zod";
import { scalarCatalog } from "../../src/definition/scalars/catalog.js";
import { firstDifference, streamHistory } from "../replay/harness.js";
import {
  SCALAR_CASES,
  type ScalarCase,
  materializeCaseValue,
} from "./scalar-cases.js";
import {
  CATALOG_SCALARS,
  actionTypeFor,
  buildScalarsModel,
  fieldNameFor,
  jsonCases,
} from "./scalars-model.js";

/**
 * A scalar decides the same thing on every surface a document has.
 *
 * Three of them, and they are not interchangeable. The **action creator**
 * refuses an input before it becomes an action at all. The **reducer** refuses
 * one that reached it anyway — which is what replaying somebody else's history
 * looks like — and records the refusal as a failed operation. **State**
 * validation answers whether a document's contents are of the model's type.
 *
 * All three have to route through the one binding the catalog holds under
 * `document-engineering-1.40`, because that binding is what a schema-first
 * model's generated Zod reproduces (pinned scalar for scalar by
 * `scalar-catalog.test.ts` against the installed package). If a code-first
 * model accepted one more value than that on any surface, replay of a shared
 * history would diverge — an accepted-set widening is a consensus change, not
 * a convenience.
 */

const PROFILE = "document-engineering-1.40";

const VALIDATOR_DIFFERENCES: ReadonlySet<string> = new Set(
  Object.entries(SCALAR_CASES).flatMap(([name, { accepts, rejects }]) =>
    [...accepts, ...rejects]
      .filter((entry) => entry.recordedDifferences?.validator !== undefined)
      .map((entry) => `${name}/${entry.id}`),
  ),
);

type ModelHandle = DocumentModelModule & {
  readonly actions: Record<string, (input: unknown) => Action>;
  readonly reducer: (
    document: PHDocument<PHBaseState>,
    action: Action,
  ) => PHDocument<PHBaseState>;
  readonly utils: {
    createDocument: () => PHDocument<PHBaseState>;
    createState: (scoped: unknown) => unknown;
    isStateOfType: (state: unknown) => boolean;
  };
};

const MODEL = buildScalarsModel() as unknown as ModelHandle;

function creatorKeyFor(name: string): string {
  return actionTypeFor(MODEL, name)
    .toLowerCase()
    .replace(/_(.)/g, (_match, letter: string) => letter.toUpperCase());
}

function validatorFor(name: string): z.ZodType {
  return scalarCatalog.resolve(name, PROFILE)!.validator;
}

type Case = {
  readonly id: string;
  readonly partition: "accepts" | "rejects";
  readonly value: unknown;
};

function allCases(name: string): readonly Case[] {
  const { accepts, rejects } = SCALAR_CASES[name as PowerhouseScalarName];
  const take = (
    cases: readonly ScalarCase[],
    partition: "accepts" | "rejects",
  ): Case[] =>
    cases.map((entry) => ({
      id: entry.id,
      partition,
      value: materializeCaseValue(entry.input),
    }));
  return [...take(accepts, "accepts"), ...take(rejects, "rejects")];
}

/**
 * What the operation's input field accepts: the scalar's own answer, whole.
 *
 * Including for an absent value. `Unknown` and `Upload` validate with
 * `z.unknown()` and `z.any()`, which accept one, so declaring their field
 * required does not refuse it — the recorded
 * `unknown-upload-non-json-acceptance` difference, reproduced here rather than
 * narrowed, because narrowing it would refuse operations a shipped history
 * already contains.
 */
function fieldAccepts(name: string, value: unknown): boolean {
  return validatorFor(name).safeParse(value).success;
}

function creatorAccepts(name: string, value: unknown): boolean {
  try {
    MODEL.actions[creatorKeyFor(name)]({ value });
    return true;
  } catch {
    return false;
  }
}

/** A persisted action built without the creator, as replay hands one over. */
function rawAction(name: string, value: unknown, index: number): Action {
  return {
    id: `case-${name}-${index}`,
    type: actionTypeFor(MODEL, name),
    input: { value },
    scope: "global",
    timestampUtcMs: new Date(1_700_000_000_000 + index).toISOString(),
  } as unknown as Action;
}

function lastOperationError(
  document: PHDocument<PHBaseState>,
): string | undefined {
  return (document.operations.global as unknown as { error?: string }[]).at(-1)
    ?.error;
}

describe("the action creator refuses what the catalog refuses", () => {
  it.each(CATALOG_SCALARS)("%s", (name) => {
    for (const { id, value, partition } of allCases(name)) {
      const where = `${name} ${partition}/${id}`;
      expect(creatorAccepts(name, value), where).toBe(
        fieldAccepts(name, value),
      );
      if (!VALIDATOR_DIFFERENCES.has(`${name}/${id}`)) {
        expect(creatorAccepts(name, value), `${where} (declared)`).toBe(
          partition === "accepts",
        );
      }
    }
  });
});

describe("the reducer refuses what the catalog refuses", () => {
  it.each(CATALOG_SCALARS)("%s", (name) => {
    const field = fieldNameFor(name);
    let document = MODEL.utils.createDocument();
    for (const [index, { id, value, partition }] of allCases(name).entries()) {
      const before = (
        document.state as unknown as { global: Record<string, unknown> }
      ).global[field];
      document = MODEL.reducer(document, rawAction(name, value, index));
      const failed = lastOperationError(document) !== undefined;
      const where = `${name} ${partition}/${id}`;
      expect(!failed, where).toBe(fieldAccepts(name, value));
      if (!VALIDATOR_DIFFERENCES.has(`${name}/${id}`)) {
        expect(!failed, `${where} (declared)`).toBe(partition === "accepts");
      }
      // A refused operation is recorded and leaves the state where it was; an
      // accepted one is the value itself, not a coerced copy of it.
      const after = (
        document.state as unknown as { global: Record<string, unknown> }
      ).global[field];
      expect(after, `${where} state`).toStrictEqual(failed ? before : value);
    }
  });
});

describe("state validation refuses what the catalog refuses", () => {
  it.each(CATALOG_SCALARS)("%s", (name) => {
    const field = fieldNameFor(name);
    for (const { id, value, partition } of allCases(name)) {
      const state = MODEL.utils.createState({ global: { [field]: value } });
      const where = `${name} ${partition}/${id}`;
      // The state field is nullable, so a null is a valid state whatever the
      // scalar would have said about it as an operation input.
      const expected = value === null || fieldAccepts(name, value);
      expect(MODEL.utils.isStateOfType(state), where).toBe(expected);
    }
  });
});

describe("replay reproduces a history of accepted and failed operations", () => {
  /**
   * JSON-valued cases only: a persisted history is JSON, and a `Date` or an
   * absent value could not have been written to one.
   */
  function history(): readonly { readonly action: Action }[] {
    let index = 0;
    return CATALOG_SCALARS.flatMap((name) =>
      jsonCases(name).map(({ value }) => ({
        action: rawAction(name, value, index++),
      })),
    );
  }

  it("keeps every historically failed operation failed", () => {
    const steps = history();
    // One document, streamed twice. Creating two would differ at append zero:
    // the platform stamps `CREATE_DOCUMENT` with a fresh id.
    const document = MODEL.utils.createDocument();
    const run = streamHistory(
      MODEL as unknown as DocumentModelModule<PHBaseState>,
      document,
      steps,
    );
    // The platform writes operations of its own; only the ones this history
    // submitted are counted.
    const submitted = new Set(
      CATALOG_SCALARS.map((name) => actionTypeFor(MODEL, name)),
    );
    const operations = run.snapshots
      .at(-1)!
      .operations.filter((operation) => submitted.has(operation.type));
    expect(operations.length).toBe(steps.length);

    const failed = operations.filter(
      (operation) => operation.error !== null,
    ).length;
    // Both outcomes are really in this history; a run that accepted or refused
    // everything would satisfy the comparison below while proving nothing.
    expect(failed).toBeGreaterThan(0);
    expect(failed).toBeLessThan(operations.length);

    const second = streamHistory(
      buildScalarsModel() as unknown as DocumentModelModule<PHBaseState>,
      document,
      steps,
    );
    // Recompiled from the same declaration, streamed over the same history:
    // every prefix agrees, including which operations carry which error.
    expect(firstDifference(run, second)).toBeNull();
  });

  it("diverges at the operation whose verdict changed, not merely at the end", () => {
    // The guard the comparison above is worth having. Same history, same
    // length — one operation's input replaced by a value the scalar refuses.
    // A comparison that only looked at the final state, or that stopped at a
    // length mismatch, would not see this.
    const steps = history();
    const document = MODEL.utils.createDocument();
    const changed = steps.findIndex(
      (step) =>
        (step.action as unknown as { input: { value: unknown } }).input
          .value !== null,
    );
    expect(changed).toBeGreaterThanOrEqual(0);

    const original = streamHistory(
      MODEL as unknown as DocumentModelModule<PHBaseState>,
      document,
      steps,
    );
    const widened = streamHistory(
      MODEL as unknown as DocumentModelModule<PHBaseState>,
      document,
      steps.map((step, index) =>
        index === changed
          ? {
              action: {
                ...(step.action as unknown as Record<string, unknown>),
                input: { value: { not: "a scalar" } },
              } as unknown as Action,
            }
          : step,
      ),
    );

    const difference = firstDifference(original, widened);
    expect(difference).not.toBeNull();
    // At that operation's own prefix, not at some later one.
    expect(difference!.append).toBe(changed + 1);
  });
});
