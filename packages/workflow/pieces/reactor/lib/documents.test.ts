import type { DocumentModelModule } from "@powerhousedao/shared/document-model";
import { defineDocumentModel, materialize, ph } from "document-model";
import { afterEach, describe, expect, it, vi } from "vitest";
import { describeModel, plainAction, typedAction } from "./documents.js";

describe("plainAction", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("stamps auth actions built in one millisecond strictly increasing", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-01T00:00:00.000Z"));
    const stamps = [1, 2, 3].map(
      () => plainAction("SET_GRANT", {}, "auth").timestampUtcMs,
    );
    expect(stamps).toEqual([
      "2026-04-01T00:00:00.000Z",
      "2026-04-01T00:00:00.001Z",
      "2026-04-01T00:00:00.002Z",
    ]);
  });

  it("stamps every other scope with the wall clock", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-01T00:00:00.000Z"));
    plainAction("SET_GRANT", {}, "auth");
    plainAction("SET_GRANT", {}, "auth");
    for (const scope of ["global", "local", "document"]) {
      expect(plainAction("SET_NAME", {}, scope).timestampUtcMs).toBe(
        "2026-05-01T00:00:00.000Z",
      );
    }
  });
});

describe("a code-first model's actions", () => {
  const notes = defineDocumentModel({
    id: "acme/notes",
    name: "Notes",
    description: "",
    extension: "notes",
    version: 1,
    author: { name: "Acme" },
    scopes: {
      global: {
        schema: ph.object("NotesState", {
          fields: { title: ph.String({ required: true }) },
        }),
        initialValue: { title: "" },
      },
      local: { schema: null, initialValue: {} },
    },
  });
  const module = materialize(
    notes.version({
      modules: [
        notes.module("main", {
          operations: ({ global }) => ({
            setTitle: global({
              input: ph.input({
                fields: { title: ph.String({ required: true }) },
              }),
              reduce(state, input) {
                state.title = input.title;
              },
            }),
          }),
        }),
      ],
    }),
  ) as unknown as DocumentModelModule;

  it("are offered by the action type they dispatch", () => {
    expect(describeModel(module).actions.map(({ type }) => type)).toEqual([
      "SET_TITLE",
      "SET_NAME",
    ]);
  });

  it("are built by the model's own creator from that type", () => {
    const action = typedAction(module, "SET_TITLE", { title: "Q3" });
    expect({ type: action.type, input: action.input }).toEqual({
      type: "SET_TITLE",
      input: { title: "Q3" },
    });
    expect(() => typedAction(module, "SET_TITLE", { title: 3 })).toThrow();
  });

  it.each([
    ["no specifications", { documentType: "acme/notes" }],
    ["specifications that are not a list", { specifications: "v1" }],
    [
      "an operation without an action type",
      {
        specifications: [
          { version: 1, modules: [{ operations: [{ name: "SetTitle" }] }] },
        ],
      },
    ],
  ])(
    "fall back to the stored names for a definition with %s",
    (_, definition) => {
      const invalid = {
        ...module,
        definition,
      } as unknown as DocumentModelModule;
      expect(describeModel(invalid).actions.map(({ type }) => type)).toEqual([
        "SetTitle",
        "SET_NAME",
      ]);
    },
  );
});
