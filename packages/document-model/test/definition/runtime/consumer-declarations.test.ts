import { describe, expect, it } from "vitest";
import { compileConsumer } from "../helpers/consumer-project.js";

const consumer = `
import {
  defineDocumentModel,
  defineDocumentModelFamily,
  materialize,
  ph,
} from "document-model";

export const TodoStatus = ph.enum("TodoStatus", { values: ["OPEN", "DONE"] });
export const Named = ph.interface("Named", {
  fields: { name: ph.String({ required: true }) },
});
export const Person = ph.object("Person", {
  implements: [Named],
  fields: { name: ph.String({ required: true }) },
});
export const Assignee = ph.union("Assignee", { members: [Person] });
export const Filter = ph.input("Filter", {
  fields: { status: ph.ref(TodoStatus) },
});

export const TodoState = ph.object("TodoState", {
  fields: {
    title: ph.String({ required: true }),
    status: ph.ref(TodoStatus, { required: true }),
    tags: ph.list(ph.String({ required: true })),
    dueAt: ph.DateTime(),
    budget: ph.AmountFiat(),
    assignee: ph.ref(Assignee),
  },
});

export const TodoLocalState = ph.object("TodoLocalState", {
  fields: { draft: ph.String() },
});

export const todo = defineDocumentModel({
  id: "consumer/todo",
  name: "Todo",
  description: "A consumer's model.",
  extension: "todo",
  version: 1,
  author: { name: "Consumer" },
  scopes: {
    global: {
      schema: TodoState,
      initialValue: {
        title: "",
        status: "OPEN",
        tags: null,
        dueAt: null,
        budget: null,
        assignee: null,
      },
    },
    local: { schema: TodoLocalState, initialValue: { draft: null } },
    auxiliaryTypes: [Filter],
  },
});

export const items = todo.module("items", {
  operations: ({ global, local }) => ({
    setTitle: global({
      input: ph.input({ fields: { title: ph.String({ required: true }) } }),
      errors: { EmptyTitle: { description: "The title is empty." } },
      reduce(state, input, ctx) {
        if (input.title === "") throw new ctx.errors.EmptyTitle();
        state.title = input.title;
      },
    }),
    setDraft: local({
      input: ph.input({ fields: { draft: ph.String() } }),
      reduce(state, input) {
        state.draft = input.draft ?? null;
      },
    }),
  }),
});

export const TodoVersion = todo.version({ modules: [items] });
export const Todo = materialize(TodoVersion);
export const TodoFamilyDefinition = defineDocumentModelFamily({
  versions: [TodoVersion],
  upgradeManifest: {
    documentType: "consumer/todo",
    latestVersion: 1,
    supportedVersions: [1],
    upgrades: {},
  },
});
export const TodoFamily = materialize(TodoFamilyDefinition);
`;

const use = `
import type { DocumentModelModule } from "document-model";
import type { GlobalStateOf, LocalStateOf } from "document-model";
import { Todo, TodoFamily } from "./consumer.js";

const global: GlobalStateOf<typeof Todo> = {
  title: "Write tests",
  status: "DONE",
  tags: ["a"],
  dueAt: null,
  budget: { unit: "USD", value: 5 },
  assignee: { name: "Ada" },
};
const local: LocalStateOf<typeof Todo> = { draft: "notes" };
const titled: { readonly type: "SET_TITLE"; readonly scope: "global" } =
  Todo.actions.setTitle({ title: "Ship" });
const drafted: { readonly type: "SET_DRAFT"; readonly scope: "local" } =
  Todo.actions.setDraft({});
const module: DocumentModelModule<typeof Todo extends { utils: { createState(): infer S } } ? S : never> = Todo;
const status: "OPEN" | "DONE" = Todo.utils.createDocument().state.global.status;
const sameModule: typeof Todo.actions.setTitle = TodoFamily.at(1).actions.setTitle;

// @ts-expect-error title must be a string
Todo.actions.setTitle({ title: 1 });
// @ts-expect-error setTitle requires its input
Todo.actions.setTitle();
// @ts-expect-error no operation is named removeTodo
Todo.actions.removeTodo({});
// @ts-expect-error status is an enum
const wrongStatus: GlobalStateOf<typeof Todo> = { ...global, status: "LATE" };

// @ts-expect-error the family has no version 2
TodoFamily.at(2);

export { drafted, local, module, sameModule, status, titled, wrongStatus };
`;

const inlineConsumer = `
import { defineDocumentModel, materialize, ph } from "document-model";
import { defineScalar } from "document-model/scalars";
import { z } from "zod";

const Iban = defineScalar({
  name: "Iban",
  description: "International bank account number",
  schema: z.string().regex(/^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$/),
  example: "DE89370400440532013000",
});
const Status = ph.enum("Status", {
  values: ["OPEN", { name: "DONE", description: "Finished." }],
});
const Person = ph.object("Person", {
  implements: [
    ph.interface("Named", { fields: { name: ph.String({ required: true }) } }),
  ],
  fields: { name: ph.String({ required: true }), iban: ph.scalar(Iban) },
});
const Named = Person.implements[0];
const Member = ph.union("Member", {
  members: [
    Person,
    ph.object("Team", {
      fields: {
        name: ph.String({ required: true }),
        lead: ph.ref(() => Person),
      },
    }),
  ],
});

const model = defineDocumentModel({
  id: "consumer/ledger",
  name: "Ledger",
  description: "A consumer's model with inline descriptors.",
  extension: "ledger",
  version: 1,
  author: { name: "Consumer" },
  scopes: {
    global: {
      schema: ph.object("LedgerState", {
        fields: {
          title: ph.String({
            required: true,
            description: "The title.",
            defaultValue: "Untitled",
          }),
          count: ph.Int({ required: true, deprecated: "Use total." }),
          total: ph.Money(),
          grid: ph.list(ph.list(ph.Int({ required: true })), {
            required: true,
          }),
          people: ph.list(ph.ref(Person, { required: true }), {
            required: true,
          }),
          status: ph.ref(Status, { required: true }),
          owner: ph.ref(Named),
          member: ph.ref(Member),
          team: ph.ref(Member.members[1]),
          iban: ph.scalar(Iban, { required: true }),
        },
      }),
      initialValue: {
        title: "Untitled",
        count: 0,
        total: null,
        grid: [],
        people: [],
        status: "OPEN",
        owner: null,
        member: null,
        team: null,
        iban: "DE89370400440532013000",
      },
    },
    local: {
      schema: ph.object("LedgerLocalState", {
        fields: { note: ph.String() },
      }),
      initialValue: { note: null },
    },
  },
});

const items = model.module("items", {
  operations: ({ global, local }) => ({
    addPerson: global({
      input: ph.input({
        fields: {
          name: ph.String({ required: true }),
          iban: ph.scalar(Iban),
          filter: ph.ref(
            ph.input({ fields: { status: ph.ref(Status) } }),
          ),
          tags: ph.list(ph.String({ required: true })),
        },
      }),
      errors: { Duplicate: { description: "The person exists." } },
      reduce(state, input, ctx) {
        if (state.people.some((person) => person.name === input.name)) {
          throw new ctx.errors.Duplicate();
        }
        state.people.push({ name: input.name, iban: input.iban ?? null });
      },
    }),
    setNote: local({
      input: ph.input("SetNoteInput", { fields: { note: ph.String() } }),
      reduce(state, input) {
        state.note = input.note ?? null;
      },
    }),
  }),
});

const noLocal = defineDocumentModel({
  id: "consumer/plain",
  name: "Plain",
  description: "A consumer's model without local state.",
  extension: "plain",
  version: 1,
  author: { name: "Consumer" },
  scopes: {
    global: {
      schema: ph.object("PlainState", { fields: { n: ph.Int() } }),
      initialValue: { n: null },
    },
    local: { schema: null, initialValue: {} },
  },
});

export const v1 = model.version({ modules: [items] });
export const Ledger = materialize(v1);
export const plainV1 = noLocal.version({ modules: [] });
export const Plain = materialize(plainV1);
`;

const inlineUse = `
import type { GlobalStateOf, LocalStateOf } from "document-model";
import { Ledger, Plain } from "./consumer.js";

const person = { name: "Ada", iban: null };
const global: GlobalStateOf<typeof Ledger> = {
  title: "Books",
  count: 1,
  total: 5,
  grid: [[1, 2], null],
  people: [person],
  status: "DONE",
  owner: person,
  member: { name: "Core", lead: person },
  team: null,
  iban: "DE89370400440532013000",
};
const local: LocalStateOf<typeof Ledger> = { note: null };
const added: { readonly type: "ADD_PERSON"; readonly scope: "global" } =
  Ledger.actions.addPerson({
    name: "Ada",
    filter: { status: "OPEN" },
  });
const plain: GlobalStateOf<typeof Plain> = { n: 1 };

// @ts-expect-error status is an enum
Ledger.actions.addPerson({ name: "Ada", filter: { status: "LATE" } });
// @ts-expect-error grid holds lists of integers
const wrongGrid: GlobalStateOf<typeof Ledger> = { ...global, grid: [["a"]] };

export { added, global, local, plain, wrongGrid };
`;

describe("a consumer's declaration emit", () => {
  const { declaration, diagnostics } = compileConsumer({
    "consumer.ts": consumer,
    "use.ts": use,
  });

  it("emits and type-checks a materialized model through the package entry", () => {
    expect(diagnostics).toStrictEqual([]);
  });

  it("names the module without any", () => {
    expect(declaration).toContain("export declare const Todo:");
    expect(declaration).not.toMatch(/\bany\b/);
    expect(declaration).not.toContain("reduce");
  });
});

describe("a consumer's declaration emit with inline descriptors", () => {
  const { declaration, diagnostics } = compileConsumer({
    "consumer.ts": inlineConsumer,
    "use.ts": inlineUse,
  });

  it("emits and type-checks a model whose descriptors are not exported", () => {
    expect(diagnostics).toStrictEqual([]);
  });

  it("names the version and module without any", () => {
    expect(declaration).toContain("export declare const v1:");
    expect(declaration).toContain("export declare const Ledger:");
    expect(declaration).not.toMatch(/\bany\b/);
  });
});
