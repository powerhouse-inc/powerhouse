// Pure descriptor translation over an in-memory piece: no bundles, no I/O.
import {
  createAction,
  createPiece,
  createTrigger,
  PieceAuth,
  TriggerStrategy,
} from "@powerhousedao/pieces-framework";
import {
  buildDescriptor,
  describeProperties,
} from "../../../src/pieces/activepieces/descriptor.js";
import type {
  ApPiece,
  ApProperty,
} from "../../../src/pieces/activepieces/types.js";

const noop = () => Promise.resolve(undefined);

const props: Record<string, ApProperty> = {
  title: {
    displayName: "Title",
    description: "Card title",
    placeholder: "e.g. Fix the bug",
    type: "SHORT_TEXT",
    required: true,
  },
  board: {
    displayName: "Board",
    type: "DROPDOWN",
    required: true,
    refreshers: ["auth", "workspace"],
    options: () => Promise.resolve({ options: [] }),
  },
  fields: {
    displayName: "Custom fields",
    type: "DYNAMIC",
    required: false,
    refreshers: ["board"],
    props: () => Promise.resolve({}),
  },
  labels: {
    displayName: "Labels",
    type: "ARRAY",
    required: false,
    properties: {
      name: { displayName: "Name", type: "SHORT_TEXT", required: true },
      color: {
        displayName: "Color",
        type: "STATIC_DROPDOWN",
        required: false,
        options: {
          options: [
            { label: "Red", value: "red" },
            { label: "Blue", value: "blue" },
          ],
        },
      },
      picker: {
        displayName: "Picker",
        type: "DROPDOWN",
        required: false,
        refreshers: [],
        options: () => Promise.resolve({ options: [] }),
      },
    },
  },
  tags: {
    displayName: "Tags",
    type: "ARRAY",
    required: false,
  },
  meta: { displayName: "Meta", type: "OBJECT", required: false },
  note: { displayName: "", description: "", type: "MARKDOWN", required: false },
  retries: {
    displayName: "Retries",
    type: "NUMBER",
    required: false,
    advanced: true,
    display: "stepper",
    min: 0,
    max: 5,
    step: 1,
    width: "half",
  },
  urgent: {
    displayName: "Urgent",
    type: "CHECKBOX",
    required: false,
    reveals: ["retries", 42 as unknown as string],
  },
  warning: {
    displayName: "Careful",
    type: "MARKDOWN",
    required: false,
    variant: "WARNING",
  },
  priority: {
    displayName: "Priority",
    type: "STATIC_DROPDOWN",
    required: false,
    display: "cards",
    options: {
      disabled: true,
      placeholder: "Pick one",
      options: [
        { label: "High", value: "high", description: "Now", icon: "bolt" },
      ],
    },
  },
  bogus: {
    displayName: "Bogus",
    type: "SHORT_TEXT",
    required: false,
    width: "wide",
    min: Number.NaN,
  },
};

const piece: ApPiece = {
  displayName: "Boards",
  description: "Kanban",
  categories: ["PRODUCTIVITY"],
  actions: {
    create_card: {
      name: "create_card",
      displayName: "Create card",
      requireAuth: true,
      props,
      propertyGroups: [
        {
          key: "main",
          display: "section",
          label: "Card",
          props: ["title", "board"],
        },
        { key: "broken", display: "tabs" },
      ],
      classification: "DESTRUCTIVE",
      errorHandlingOptions: {
        retryOnFailure: { defaultValue: true, hide: true },
      },
      run: noop,
    },
  },
  triggers: {},
  deprecated: true,
};

describe("buildDescriptor", () => {
  const descriptor = buildDescriptor(piece, {
    packageName: "@acme/piece-boards",
    version: "1.0.0",
  });
  const action = descriptor.actions[0];
  const prop = (name: string) => action.props.find((p) => p.name === name)!;

  it("carries description and placeholder, dropping empty strings", () => {
    expect(prop("title")).toMatchObject({
      description: "Card title",
      placeholder: "e.g. Fix the bug",
      required: true,
    });
    expect(prop("note").description).toBeUndefined();
    expect(prop("note").placeholder).toBeUndefined();
  });

  it("marks props the piece put in the advanced section, and only those", () => {
    expect(prop("retries").advanced).toBe(true);
    expect(prop("title").advanced).toBeUndefined();
  });

  it("carries layout and control hints, dropping malformed ones", () => {
    expect(prop("retries")).toMatchObject({
      display: "stepper",
      min: 0,
      max: 5,
      step: 1,
      width: "half",
    });
    expect(prop("urgent").reveals).toEqual(["retries"]);
    expect(prop("warning").variant).toBe("WARNING");
    expect(prop("priority")).toMatchObject({
      display: "cards",
      staticDisabled: true,
      staticPlaceholder: "Pick one",
      staticOptions: [
        { label: "High", value: "high", description: "Now", icon: "bolt" },
      ],
    });
    expect(prop("bogus").width).toBeUndefined();
    expect(prop("bogus").min).toBeUndefined();
  });

  it("carries the action's groups, classification and error handling", () => {
    expect(action.propertyGroups).toEqual([
      {
        key: "main",
        display: "section",
        label: "Card",
        props: ["title", "board"],
      },
    ]);
    expect(action.classification).toBe("DESTRUCTIVE");
    expect(action.errorHandlingOptions).toEqual({
      retryOnFailure: { defaultValue: true, hide: true },
    });
    expect(descriptor.deprecated).toBe(true);
  });

  it("exposes refreshers and resolver ids on dynamic props only", () => {
    expect(prop("board")).toMatchObject({
      hasDynamicResolver: true,
      refreshers: ["auth", "workspace"],
      dynamicResolverId: "activepieces:@acme/piece-boards#create_card.board",
    });
    expect(prop("fields")).toMatchObject({
      type: "DYNAMIC",
      hasDynamicResolver: true,
      refreshers: ["board"],
    });
    expect(prop("title").refreshers).toBeUndefined();
    expect(prop("title").dynamicResolverId).toBeUndefined();
  });

  it("describes ARRAY item fields recursively", () => {
    const labels = prop("labels");
    expect(labels.properties?.map((p) => p.name)).toEqual([
      "name",
      "color",
      "picker",
    ]);
    const color = labels.properties!.find((p) => p.name === "color")!;
    expect(color.staticOptions).toEqual([
      { label: "Red", value: "red" },
      { label: "Blue", value: "blue" },
    ]);
    // Nested resolvers are flagged but not addressable by id.
    const picker = labels.properties!.find((p) => p.name === "picker")!;
    expect(picker.hasDynamicResolver).toBe(true);
    expect(picker.dynamicResolverId).toBeUndefined();
  });

  it("leaves plain ARRAY and OBJECT props without nested properties", () => {
    expect(prop("tags").properties).toBeUndefined();
    expect(prop("meta").properties).toBeUndefined();
  });
});

describe("requireReactor", () => {
  const block = { description: "", auth: PieceAuth.None(), props: {} };
  const framed = createPiece({
    displayName: "Docs",
    auth: PieceAuth.None(),
    logoUrl: "",
    authors: [],
    actions: [
      createAction({
        ...block,
        name: "archive",
        displayName: "Archive",
        requireReactor: "write",
        run: (ctx) => ctx.reactor.find({ type: "acme/invoice" }),
      }),
      createAction({
        ...block,
        name: "peek",
        displayName: "Peek",
        requireReactor: "read",
        run: (ctx) => ctx.reactor.getDocumentModelModules(),
      }),
      createAction({
        ...block,
        name: "plain",
        displayName: "Plain",
        run: noop,
      }),
    ],
    triggers: [
      createTrigger({
        ...block,
        name: "changed",
        displayName: "Changed",
        type: TriggerStrategy.POLLING,
        requireReactor: "read",
        sampleData: {},
        onEnable: () => Promise.resolve(),
        onDisable: () => Promise.resolve(),
        run: () => Promise.resolve([]),
      }),
    ],
  }) as unknown as ApPiece;

  it("copies each block's declaration, next to requireAuth", () => {
    const descriptor = buildDescriptor(framed, {
      packageName: "@acme/piece-docs",
      version: "1.0.0",
    });
    const actions = Object.fromEntries(
      descriptor.actions.map((a) => [a.name, a.requireReactor]),
    );
    expect(actions).toEqual({
      archive: "write",
      peek: "read",
      plain: undefined,
    });
    expect("requireReactor" in descriptor.actions[2]).toBe(false);
    expect(descriptor.triggers[0].requireReactor).toBe("read");
  });

  it("drops a declaration a foreign bundle mangled", () => {
    const descriptor = buildDescriptor(
      {
        displayName: "Foreign",
        actions: { odd: { name: "odd", requireReactor: "admin", run: noop } },
        triggers: { t: { name: "t", type: "POLLING", requireReactor: 1 } },
      },
      { packageName: "@acme/piece-foreign", version: "1.0.0" },
    );
    expect("requireReactor" in descriptor.actions[0]).toBe(false);
    expect("requireReactor" in descriptor.triggers[0]).toBe(false);
  });
});

describe("describeProperties", () => {
  it("translates a DYNAMIC props() result into descriptors", () => {
    const resolved = describeProperties({
      due: { displayName: "Due", type: "DATE_TIME", required: true },
      broken: undefined as unknown as ApProperty,
    });
    expect(resolved).toEqual([
      {
        name: "due",
        displayName: "Due",
        type: "DATE_TIME",
        required: true,
        hasDynamicResolver: false,
      },
    ]);
  });

  it("returns an empty list for non-object results", () => {
    expect(describeProperties(undefined)).toEqual([]);
    expect(describeProperties(null)).toEqual([]);
  });
});

describe("trigger renewal", () => {
  const trigger = (renewConfiguration?: unknown) => ({
    name: "event",
    displayName: "Event",
    type: "WEBHOOK",
    props: {},
    ...(renewConfiguration !== undefined ? { renewConfiguration } : {}),
    onEnable: noop,
    onDisable: noop,
    run: () => Promise.resolve([]),
  });
  const describeEvent = (renewConfiguration?: unknown) =>
    buildDescriptor(
      {
        displayName: "Hooks",
        triggers: { event: trigger(renewConfiguration) as never },
      },
      { packageName: "@acme/piece-hooks", version: "1.0.0" },
    ).triggers[0];

  it("carries a CRON renewal", () => {
    const described = describeEvent({
      strategy: "CRON",
      cronExpression: "0 */12 * * *",
    });
    expect(described.renew).toEqual({
      strategy: "CRON",
      cronExpression: "0 */12 * * *",
    });
    expect(described.unsupported).toBeUndefined();
  });

  it("omits NONE and an absent renewal", () => {
    expect(describeEvent({ strategy: "NONE" })).not.toHaveProperty("renew");
    expect(describeEvent()).not.toHaveProperty("renew");
  });

  it("flags a malformed renewal instead of carrying it", () => {
    const described = describeEvent({ strategy: "CRON", cronExpression: "x" });
    expect(described).not.toHaveProperty("renew");
    expect(described.unsupported?.feature).toBe("renewConfiguration");
  });
});
