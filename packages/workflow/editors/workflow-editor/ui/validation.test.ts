import { describe, expect, it } from "vitest";
import { flowPorts } from "@powerhousedao/pieces-framework/workflow";
import type { BlockForm, BlockFormProp } from "./forms.js";
import { runtimeKeys } from "./query-keys.js";
import { QueryClient } from "@tanstack/react-query";
import { getResolvedDynamicProps } from "./design-time.js";
import { withPropDefaults } from "./prop-defaults.js";
import {
  blockMissing,
  isEmptyValue,
  REACTOR_CONNECTION_LABEL,
  missingRequired,
  resolverInputFor,
  stripOptions,
  undeclaredPortIssues,
  withSetting,
  workflowReadiness,
} from "./validation.js";

const form: BlockForm = {
  title: "Send",
  requireAuth: true,
  auth: "required",
  props: [
    { name: "to", displayName: "To", type: "SHORT_TEXT", required: true },
    { name: "cc", displayName: "Cc", type: "ARRAY", required: false },
    { name: "tags", displayName: "Tags", type: "ARRAY", required: true },
    { name: "note", displayName: "Note", type: "MARKDOWN", required: true },
    {
      name: "mode",
      displayName: "Mode",
      type: "STATIC_DROPDOWN",
      required: true,
      defaultValue: "plain",
    },
  ],
};

describe("isEmptyValue", () => {
  it("treats blank strings, empty arrays and nullish as empty", () => {
    expect(isEmptyValue("")).toBe(true);
    expect(isEmptyValue("  ")).toBe(true);
    expect(isEmptyValue([])).toBe(true);
    expect(isEmptyValue(null)).toBe(true);
    expect(isEmptyValue(undefined)).toBe(true);
    expect(isEmptyValue(0)).toBe(false);
    expect(isEmptyValue(false)).toBe(false);
    expect(isEmptyValue({})).toBe(false);
    expect(isEmptyValue("{{steps.a.output}}")).toBe(false);
  });
});

describe("missingRequired", () => {
  it("lists required props without a value", () => {
    expect(
      missingRequired(form.props, { to: "", tags: [], mode: "plain" }),
    ).toEqual(["To", "Tags"]);
    expect(
      missingRequired(form.props, { to: "a@b", tags: ["x"], mode: "plain" }),
    ).toEqual([]);
    expect(missingRequired(form.props, "not an object")).toEqual([
      "To",
      "Tags",
      "Mode",
    ]);
  });

  it("does not count a piece default as a value", () => {
    expect(missingRequired(form.props, { to: "a@b", tags: ["x"] })).toEqual([
      "Mode",
    ]);
  });
});

describe("isPropVisible / conditional required fields", () => {
  const secret: BlockFormProp = {
    name: "secretRef",
    displayName: "Signing secret",
    type: "PH_SECRET_REF",
    required: true,
    showWhen: { prop: "scheme", oneOf: ["token", "hmac"] },
  };

  it("does not require a field its condition hides", () => {
    // An unverified endpoint has no secret to sign with. Counting the hidden
    // field as missing would show a warning with no field to resolve it.
    expect(missingRequired([secret], { scheme: "none" })).toEqual([]);
    expect(missingRequired([secret], {})).toEqual([]);
  });

  it("requires it once the condition is met", () => {
    expect(missingRequired([secret], { scheme: "token" })).toEqual([
      "Signing secret",
    ]);
    expect(
      missingRequired([secret], {
        scheme: "token",
        secretRef: "secret://v1:a",
      }),
    ).toEqual([]);
  });
});

describe("a mode-gated form's required fields", () => {
  // The shape the reactor serves for the core schedule trigger.
  const props: BlockFormProp[] = [
    {
      name: "mode",
      displayName: "Runs",
      type: "STATIC_DROPDOWN",
      required: true,
    },
    {
      name: "cron",
      displayName: "Cron expression",
      type: "SHORT_TEXT",
      required: true,
      showWhen: { prop: "mode", oneOf: ["cron"] },
    },
    {
      name: "every",
      displayName: "Every",
      type: "NUMBER",
      required: true,
      showWhen: { prop: "mode", oneOf: ["interval"] },
    },
  ];

  it("asks for the mode instead of inferring it from the fields", () => {
    expect(missingRequired(props, { every: 5 })).toEqual(["Runs"]);
  });

  it("asks only for the fields the mode shows", () => {
    expect(missingRequired(props, { mode: "cron", every: 5 })).toEqual([
      "Cron expression",
    ]);
    expect(missingRequired(props, { mode: "interval", every: 5 })).toEqual([]);
  });
});

describe("blockMissing", () => {
  const base = {
    block: {
      pieceName: "@acme/mail",
      pieceVersion: "1.0.0",
      kind: "action" as const,
      name: "send",
    },
    connectionId: null,
  };

  it("adds the connection first when the block requires one", () => {
    expect(
      blockMissing({ ...base, form, config: { to: "a@b", mode: "plain" } }),
    ).toEqual(["Connection", "Tags"]);
    expect(
      blockMissing({
        ...base,
        form,
        config: { to: "a@b", tags: ["x"], mode: "plain" },
        connectionId: "conn",
      }),
    ).toEqual([]);
  });

  it("asks for a required field left unset despite its default", () => {
    const config = { to: "a@b", tags: ["x"] };
    const input = { ...base, form, connectionId: "conn" };
    expect(blockMissing({ ...input, config })).toEqual(["Mode"]);
    expect(
      blockMissing({ ...input, config: withPropDefaults(form.props, config) }),
    ).toEqual([]);
  });

  it("asks for a reactor connection when the block declares reactor access", () => {
    const reading: BlockForm = { ...form, props: [], requireReactor: "read" };
    const input = { ...base, form: reading, connectionId: "conn", config: {} };
    expect(blockMissing(input)).toEqual([REACTOR_CONNECTION_LABEL]);
    expect(
      blockMissing({ ...input, reactorConnectionId: "reactor-1" }),
    ).toEqual([]);
    // A block that declares none never asks.
    expect(
      blockMissing({
        ...input,
        form: { ...reading, requireReactor: undefined },
      }),
    ).toEqual([]);
  });

  it("is unknown while the form loads or when there is none", () => {
    expect(blockMissing({ ...base, form: "loading", config: {} })).toBeNull();
    expect(blockMissing({ ...base, form: null, config: {} })).toBeNull();
    expect(blockMissing({ ...base, form: undefined, config: {} })).toBeNull();
  });

  it("counts nothing on a skipped step, checked or not", () => {
    expect(blockMissing({ ...base, form, config: {}, skip: true })).toEqual([]);
    expect(
      blockMissing({ ...base, form: "loading", config: {}, skip: true }),
    ).toEqual([]);
  });

  const dynamicForm: BlockForm = {
    title: "Create document",
    requireAuth: false,
    auth: "none",
    props: [
      { name: "type", displayName: "Type", type: "DROPDOWN", required: true },
      {
        name: "input",
        displayName: "Input",
        type: "DYNAMIC",
        required: true,
        refreshers: ["type"],
      },
    ],
  };
  const children: BlockFormProp[] = [
    { name: "id", displayName: "Id", type: "SHORT_TEXT", required: true },
    { name: "note", displayName: "Note", type: "SHORT_TEXT", required: false },
  ];
  const dynamic = {
    ...base,
    form: dynamicForm,
    block: { ...base.block, pieceName: "@acme/doc", name: "create" },
  };

  it("checks DYNAMIC children resolved in the cache", () => {
    const queryClient = new QueryClient();
    const config = { type: "SET_ID" };
    queryClient.setQueryData(
      runtimeKeys.dynamic(
        "rt",
        resolverInputFor(dynamic.block, dynamicForm.props[1], config, null),
      ),
      children,
    );
    const resolveDynamic = (
      input: Parameters<typeof getResolvedDynamicProps>[2],
    ) => getResolvedDynamicProps(queryClient, "rt", input);
    expect(blockMissing({ ...dynamic, config, resolveDynamic })).toEqual([
      "Id",
    ]);
    expect(
      blockMissing({
        ...dynamic,
        config: { ...config, input: { id: "x" } },
        resolveDynamic,
      }),
    ).toEqual([]);
  });

  it("falls back to the stored schema when the cache has none", () => {
    const propertySettings = withSetting(null, "input", {
      schema: stripOptions(children),
    });
    expect(
      blockMissing({
        ...dynamic,
        config: { type: "SET_ID" },
        propertySettings,
        resolveDynamic: () => undefined,
      }),
    ).toEqual(["Id"]);
  });

  it("prefers the cached answer over the stored schema", () => {
    const propertySettings = withSetting(null, "input", {
      schema: stripOptions(children),
    });
    expect(
      blockMissing({
        ...dynamic,
        config: { type: "SET_ID" },
        propertySettings,
        resolveDynamic: () => [],
      }),
    ).toEqual([]);
  });

  it("is unknown when a DYNAMIC prop is unresolved and nothing else is missing", () => {
    expect(blockMissing({ ...dynamic, config: { type: "SET_ID" } })).toBeNull();
    // A known gap still decides it.
    expect(blockMissing({ ...dynamic, config: {} })).toEqual(["Type"]);
  });

  it("takes a DYNAMIC prop bound to an expression as it is", () => {
    const propertySettings = withSetting(null, "input", { mode: "EXPRESSION" });
    expect(
      blockMissing({
        ...dynamic,
        config: { type: "SET_ID", input: "{{trigger.payload}}" },
        propertySettings,
      }),
    ).toEqual([]);
  });
});

describe("workflowReadiness", () => {
  const complete = { id: "a", missing: [] };

  it("is ready once a trigger exists and every block is complete", () => {
    expect(workflowReadiness([complete], true)).toEqual({
      ready: true,
      hasTrigger: true,
      firstIncomplete: null,
      checking: false,
    });
    expect(workflowReadiness([complete], false).ready).toBe(false);
  });

  it("points at the first block with a gap, in the order given", () => {
    const readiness = workflowReadiness(
      [complete, { id: "b", missing: null }, { id: "c", missing: ["To"] }],
      true,
    );
    expect(readiness.ready).toBe(false);
    expect(readiness.firstIncomplete).toBe("c");
    expect(readiness.checking).toBe(true);
  });

  it("holds Publish while a block is not checked yet", () => {
    const readiness = workflowReadiness(
      [complete, { id: "b", missing: null }],
      true,
    );
    expect(readiness).toMatchObject({
      ready: false,
      firstIncomplete: null,
      checking: true,
    });
  });
});

describe("stripOptions", () => {
  it("drops dropdown options at every depth", () => {
    expect(
      stripOptions([
        {
          name: "a",
          displayName: "A",
          type: "STATIC_DROPDOWN",
          required: true,
          staticOptions: [{ label: "x", value: "x" }],
          properties: [
            {
              name: "b",
              displayName: "B",
              type: "STATIC_DROPDOWN",
              required: false,
              staticOptions: [{ label: "y", value: "y" }],
            },
          ],
        },
      ]),
    ).toEqual([
      {
        name: "a",
        displayName: "A",
        type: "STATIC_DROPDOWN",
        required: true,
        properties: [
          {
            name: "b",
            displayName: "B",
            type: "STATIC_DROPDOWN",
            required: false,
          },
        ],
      },
    ]);
  });
});

describe("undeclaredPortIssues", () => {
  const branch: BlockForm = {
    title: "Branch",
    requireAuth: false,
    props: [],
    ports: ["true", "false", "error"],
  };

  it("names each port a block never takes, once", () => {
    expect(undeclaredPortIssues(branch, ["next", "true", "next"])).toEqual([
      'An edge leaves on "next", which this block never takes',
    ]);
  });

  it("judges nothing while the ports are unknown", () => {
    expect(undeclaredPortIssues("loading", ["next"])).toEqual([]);
    expect(
      undeclaredPortIssues({ ...branch, ports: undefined }, ["next"]),
    ).toEqual([]);
  });

  it("leaves the error route out of the flow ports", () => {
    expect(flowPorts(branch.ports!)).toEqual(["true", "false"]);
  });
});
