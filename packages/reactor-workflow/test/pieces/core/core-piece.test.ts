// The core piece's actions through the executor every piece action takes:
// resolved as installed, then run in process.
import { blockKey } from "@powerhousedao/pieces-framework/block-type";
import { readFileSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";
import {
  builtinLocalPieces,
  builtinPiece,
  describeBuiltinPiece,
} from "../../../src/pieces/builtin.js";
import {
  BRANCH_OPERATORS,
  CORE_PIECE_NAME,
  CORE_PIECE_VERSION,
} from "../../../src/pieces/core/index.js";
import { ActivepiecesBlockExecutor } from "../../../src/pieces/engine/blocks.js";
import { stepBlock } from "../../../src/pieces/engine/types.js";
import { BlockResolver } from "../../../src/reactor/block-resolver.js";
import {
  MANUAL_BLOCK,
  SCHEDULE_BLOCK,
  WEBHOOK_BLOCK,
} from "../../../src/reactor/core-blocks.js";
import { testRuntime } from "../../helpers/runtime.js";

const resolver = new BlockResolver({
  local: (name) => builtinLocalPieces().find((piece) => piece.name === name),
});

const core = new ActivepiecesBlockExecutor({
  cacheDir: "/tmp/na",
  resolveBlock: (block) => resolver.resolve(block),
});

// Pinned below the installed version: a host-bound piece runs what is installed.
function run(actionName: string, config: Record<string, unknown>) {
  const step = {
    id: "s",
    key: "s",
    pieceName: CORE_PIECE_NAME,
    pieceVersion: "0.0.1",
    actionName,
    config,
  };
  return core.execute({ block: stepBlock(step), config, step });
}

const branch = (config: Record<string, unknown>) => run("branch", config);

describe("branch", () => {
  const route = async (config: Record<string, unknown>) =>
    (await branch(config)).port;

  it("compares text case-insensitively unless asked", async () => {
    expect(
      await route({
        operator: "TEXT_EXACTLY_MATCHES",
        left: "Create",
        right: "create",
      }),
    ).toBe("true");
    expect(
      await route({
        operator: "TEXT_EXACTLY_MATCHES",
        left: "Create",
        right: "create",
        caseSensitive: true,
      }),
    ).toBe("false");
    expect(
      await route({
        operator: "TEXT_CONTAINS",
        left: "order shipped",
        right: "SHIP",
      }),
    ).toBe("true");
    expect(
      await route({
        operator: "TEXT_DOES_NOT_START_WITH",
        left: "abc",
        right: "a",
      }),
    ).toBe("false");
  });

  it("compares numbers as numbers", async () => {
    expect(
      await route({ operator: "NUMBER_IS_GREATER_THAN", left: 10, right: "9" }),
    ).toBe("true");
    // As text "10" < "9"; as numbers it is not.
    expect(
      await route({ operator: "NUMBER_IS_LESS_THAN", left: "10", right: "9" }),
    ).toBe("false");
    expect(
      await route({ operator: "NUMBER_IS_EQUAL_TO", left: 5, right: "5.0" }),
    ).toBe("true");
  });

  it("reads booleans, dates, lists and existence", async () => {
    expect(await route({ operator: "BOOLEAN_IS_TRUE", left: true })).toBe(
      "true",
    );
    expect(await route({ operator: "BOOLEAN_IS_FALSE", left: "false" })).toBe(
      "true",
    );
    expect(
      await route({
        operator: "DATE_IS_BEFORE",
        left: "2026-01-01T00:00:00Z",
        right: "2026-06-01",
      }),
    ).toBe("true");
    expect(
      await route({ operator: "LIST_CONTAINS", left: ["A", "b"], right: "a" }),
    ).toBe("true");
    expect(await route({ operator: "LIST_IS_EMPTY", left: [] })).toBe("true");
    expect(await route({ operator: "EXISTS", left: "" })).toBe("false");
    expect(await route({ operator: "DOES_NOT_EXIST", left: null })).toBe(
      "true",
    );
  });

  it("reports what it decided", async () => {
    expect(
      (await branch({ operator: "TEXT_CONTAINS", left: "ab", right: "b" }))
        .output,
    ).toEqual({
      operator: "TEXT_CONTAINS",
      left: "ab",
      right: "b",
      result: true,
    });
  });

  it.each([
    [{ left: "yes" }, "an operator is required"],
    [{ operator: "EQUALS", left: "a" }, 'unknown operator "EQUALS"'],
    [
      { operator: "NUMBER_IS_GREATER_THAN", left: "ten", right: 1 },
      "left must be a number",
    ],
    [
      { operator: "BOOLEAN_IS_TRUE", left: "yes" },
      "left must be true or false",
    ],
    [
      { operator: "BOOLEAN_IS_TRUE", left: "False" },
      "left must be true or false",
    ],
    [
      { operator: "LIST_CONTAINS", left: "a,b", right: "a" },
      "left must be a list",
    ],
    [
      { operator: "DATE_IS_AFTER", left: "soon", right: "2026-01-01" },
      "left must be a date",
    ],
    [
      { operator: "TEXT_CONTAINS", left: { a: 1 }, right: "a" },
      "left must be text",
    ],
  ])("fails on %j instead of guessing", async (config, message) => {
    await expect(branch(config)).rejects.toThrow(message);
  });
});

const assert = (config: Record<string, unknown>) => run("assert", config);

describe("assert", () => {
  it("passes a usable value through", async () => {
    const result = await assert({ value: "It posts to Discord." });
    expect(result).toMatchObject({
      output: { value: "It posts to Discord." },
      port: "next",
      resolution: {
        match: "installed",
        resolved: { version: CORE_PIECE_VERSION, source: "local" },
      },
    });
  });

  it("fails on a blank value unless allowEmpty is set", async () => {
    await expect(assert({ value: "" })).rejects.toThrow("value is empty");
    await expect(assert({ value: "  \n" })).rejects.toThrow("value is empty");
    await expect(assert({})).rejects.toThrow("value is empty");
    expect((await assert({ value: "", allowEmpty: true })).port).toBe("next");
  });

  it("fails on a rejected value, trimmed and case-insensitively", async () => {
    const rejectValues = ["User Safety: safe"];
    await expect(
      assert({ value: "User Safety: safe", rejectValues }),
    ).rejects.toThrow(/rejected value/);
    await expect(
      assert({ value: " user safety: SAFE ", rejectValues }),
    ).rejects.toThrow(/rejected value/);
    // A string is one rejected value, not a list.
    await expect(
      assert({ value: "nope", rejectValues: "nope" }),
    ).rejects.toThrow(/rejected value/);
    expect((await assert({ value: "A real answer.", rejectValues })).port).toBe(
      "next",
    );
  });

  it("uses the configured message when the assertion fails", async () => {
    await expect(
      assert({ value: "", message: "The model returned nothing" }),
    ).rejects.toThrow("The model returned nothing");
  });

  it("treats null and undefined as empty", async () => {
    await expect(assert({ value: null })).rejects.toThrow("value is empty");
  });

  it("stringifies a non-string value before comparing", async () => {
    expect((await assert({ value: { ok: true } })).port).toBe("next");
    await expect(
      assert({ value: { ok: true }, rejectValues: ['{"ok":true}'] }),
    ).rejects.toThrow(/rejected value/);
  });
});

describe("assert allowValues", () => {
  const allowValues = ["ENABLED", "DISABLED"];

  it("passes a value on the allow-list, trimmed and case-insensitively", async () => {
    expect((await assert({ value: "DISABLED", allowValues })).port).toBe(
      "next",
    );
    expect((await assert({ value: " disabled\n", allowValues })).port).toBe(
      "next",
    );
  });

  it("fails anything else, naming the allowed values", async () => {
    // The motivating case: a classifier answering a different question.
    await expect(assert({ value: "Safety:", allowValues })).rejects.toThrow(
      /not one of the allowed values \(enabled, disabled\)/,
    );
  });

  it("treats a string as a single allowed value", async () => {
    expect((await assert({ value: "ok", allowValues: "ok" })).port).toBe(
      "next",
    );
    await expect(assert({ value: "no", allowValues: "ok" })).rejects.toThrow(
      /allowed values/,
    );
  });

  it("still applies the reject-list and the blank check first", async () => {
    await expect(assert({ value: "", allowValues })).rejects.toThrow(
      "value is empty",
    );
    await expect(
      assert({ value: "ENABLED", allowValues, rejectValues: ["ENABLED"] }),
    ).rejects.toThrow(/rejected value/);
  });
});

// The forms the editor drew from the hand-written core catalog, verbatim.
const FORMS = JSON.parse(
  readFileSync(
    new URL("../../fixtures/core-piece-forms.json", import.meta.url),
    "utf8",
  ),
) as {
  actions: { name: string }[];
  triggers: { name: string }[];
};

const FORM_FIELDS = [
  "name",
  "displayName",
  "description",
  "strategy",
  "requireAuth",
  "ports",
  "hasSampleData",
  "display",
  "props",
] as const;

function formOf(entry: object): Record<string, unknown> {
  const record = entry as Record<string, unknown>;
  return Object.fromEntries(
    FORM_FIELDS.filter((field) => record[field] !== undefined).map((field) => [
      field,
      record[field],
    ]),
  );
}

describe("the core piece's descriptor", () => {
  const descriptor = describeBuiltinPiece(builtinPiece(CORE_PIECE_NAME)!);

  it("is described at the runtime's own version", () => {
    expect(descriptor.source).toEqual({
      packageName: CORE_PIECE_NAME,
      version: CORE_PIECE_VERSION,
    });
    expect(descriptor.displayName).toBe("Core");
    expect(descriptor.categories).toEqual(["CORE"]);
  });

  it("keeps every action and trigger form as it was", () => {
    expect(descriptor.unsupported).toBeUndefined();
    for (const trigger of descriptor.triggers) {
      expect(trigger.unsupported).toBeUndefined();
    }
    expect(descriptor.actions.map(formOf)).toEqual(FORMS.actions);
    expect(descriptor.triggers.map(formOf)).toEqual(FORMS.triggers);
  });

  it("offers every branch operator, in order", () => {
    const branch = descriptor.actions.find((a) => a.name === "branch")!;
    const operator = branch.props.find((prop) => prop.name === "operator")!;
    expect(operator.staticOptions?.map((option) => option.value)).toEqual(
      Object.keys(BRANCH_OPERATORS),
    );
    expect(operator.staticOptions).toHaveLength(22);
    // Unary operators hide the second operand.
    const right = branch.props.find((prop) => prop.name === "right")!;
    expect(right.showWhen?.oneOf).toContain("NUMBER_IS_GREATER_THAN");
    expect(right.showWhen?.oneOf).not.toContain("EXISTS");
    expect(branch.ports).toEqual(["true", "false", "error"]);
  });

  it("keeps the webhook's secret picker, label choice and the schedule builder", () => {
    const webhook = descriptor.triggers.find((t) => t.name === "webhook")!;
    const prop = (name: string) =>
      webhook.props.find((entry) => entry.name === name);
    expect(prop("secretRef")?.type).toBe("PH_SECRET_REF");
    expect(prop("prefix")?.emptyChoice).toBe("No label");
    expect(webhook.strategy).toBe("WEBHOOK");
    const schedule = descriptor.triggers.find((t) => t.name === "schedule")!;
    expect(schedule.display).toBe("schedule");
    expect(schedule.strategy).toBe("POLLING");
  });
});

describe("the core piece through the runtime", () => {
  const runtime = testRuntime();

  afterAll(() => runtime.shutdown());

  it("is listed, like any piece, with its actions and triggers", async () => {
    const catalog = await runtime.pieceCatalog().catch(() => []);
    const core = catalog.find((entry) => entry.name === CORE_PIECE_NAME);
    expect(core).toMatchObject({
      version: CORE_PIECE_VERSION,
      actionCount: 2,
      triggerCount: 3,
    });
    const actions = await runtime.pieceActions(CORE_PIECE_NAME);
    const triggers = await runtime.pieceTriggers(CORE_PIECE_NAME);
    expect(actions.version).toBe(CORE_PIECE_VERSION);
    expect(actions.actions.map((action) => action.name)).toEqual([
      "branch",
      "assert",
    ]);
    expect(triggers.triggers.map((trigger) => trigger.name)).toEqual([
      "schedule",
      "webhook",
      "manual",
    ]);
  });

  it("is searchable, and names the triggers the host feeds", async () => {
    const { hits } = await runtime.searchBlocks("a", 100);
    const core = hits
      .filter((hit) => hit.pieceName === CORE_PIECE_NAME)
      .map((hit) => blockKey(hit));
    for (const key of [MANUAL_BLOCK, SCHEDULE_BLOCK, WEBHOOK_BLOCK]) {
      expect(core).toContain(key);
    }
  });

  it("describes a block at any pinned version, and nothing it lacks", async () => {
    const block = (kind: "action" | "trigger", name: string) => ({
      pieceName: CORE_PIECE_NAME,
      pieceVersion: "0.0.1",
      kind,
      name,
    });
    await expect(
      runtime.blockDescriptor(block("action", "branch")),
    ).resolves.toMatchObject({
      displayName: "Core",
      action: { name: "branch", ports: ["true", "false", "error"] },
    });
    await expect(
      runtime.blockDescriptor(block("trigger", "manual")),
    ).resolves.toMatchObject({
      trigger: { name: "manual", strategy: "MANUAL" },
    });
    expect(
      await runtime.blockDescriptor(block("action", "nonsense")),
    ).toBeNull();
    await expect(
      runtime.blockOptions(block("action", "branch"), "operator"),
    ).rejects.toThrow("has no options to resolve");
  });
});
