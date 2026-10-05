import type { UpgradeManifest } from "document-model";
import {
  defineDocumentModel,
  defineDocumentModelFamily,
  defineScalar,
  ph,
} from "document-model";
import { z } from "zod";

export const Priority = ph.enum("Priority", { values: ["LOW", "HIGH"] });

export const Item = ph.object("Item", {
  fields: {
    id: ph.OID({ required: true }), // a field use
    priority: ph.ref(Priority), // a reference to a named type
    tags: ph.list(ph.String({ required: true })),
  },
});

export const requiredRule = {
  plain: ph.String(), // String
  required: ph.String({ required: true }), // String!
  listOfRequired: ph.list(ph.String({ required: true })), // [String!]
  requiredList: ph.list(ph.String(), { required: true }), // [String]!
};

const todoContext = defineDocumentModel({
  id: "acme/todo",
  name: "Todo",
  description: "A todo document model.",
  extension: "todo",
  version: 1,
  author: { name: "@acme/things", website: null },
  specifications: {
    global: {
      schema: ph.object("TodoState", {
        fields: {
          title: ph.String({ required: true }),
          items: ph.list(ph.ref(Item, { required: true }), { required: true }),
        },
      }),
      initialValue: { title: "", items: [] },
    },
    local: { schema: null, initialValue: {} },
  },
});

const todoItems = todoContext.module("items", {
  operations: ({ global }) => ({
    setTitle: global({
      input: ph.input({ fields: { title: ph.String({ required: true }) } }),
      reduce(state, input) {
        state.title = input.title;
      },
    }),
  }),
});

const supportedVersions = [1] as const;

const todoUpgradeManifest: UpgradeManifest<typeof supportedVersions> = {
  documentType: "acme/todo",
  latestVersion: supportedVersions[0],
  supportedVersions,
  upgrades: {},
};

export const todoFamily = defineDocumentModelFamily({
  versions: [todoContext.version({ modules: [todoItems] })],
  upgradeManifest: todoUpgradeManifest,
});

export const HexColor = defineScalar({
  name: "HexColor",
  description: "A six-digit hexadecimal color, such as #1a2b3c.",
  representation: "string",
  validator: z.string().regex(/^#[0-9a-f]{6}$/i),
  zodSource: "z.string().regex(/^#[0-9a-f]{6}$/i)",
});

export const Label = ph.object("Label", {
  fields: { color: HexColor({ required: true }) },
});
