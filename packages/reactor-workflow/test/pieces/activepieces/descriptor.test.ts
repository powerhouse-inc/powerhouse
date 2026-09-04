// Pure descriptor translation over an in-memory piece: no bundles, no I/O.
import {
  buildDescriptor,
  describeProperties,
} from "../../src/activepieces/descriptor.js";
import type { ApPiece, ApProperty } from "../../src/activepieces/types.js";

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
      run: noop,
    },
  },
  triggers: {},
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
