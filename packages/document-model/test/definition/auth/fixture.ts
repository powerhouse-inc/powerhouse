import {
  defineDocumentModel,
  materialize,
  ph,
} from "../../../src/definition/index.js";
export function noteContext(id = "test/auth-note") {
  const Status = ph.enum("NoteStatus", { values: ["DRAFT", "PUBLISHED"] });
  const Owner = ph.object("NoteOwner", {
    fields: { address: ph.String({ required: true }) },
  });
  const note = defineDocumentModel({
    id,
    name: "Note",
    description: "A protected note",
    extension: "note",
    version: 1,
    author: { name: "Test" },
    scopes: {
      global: {
        schema: ph.object("NoteState", {
          fields: {
            title: ph.String({ required: true }),
            locked: ph.Boolean({ required: true }),
            status: ph.ref(Status, { required: true }),
            owner: ph.ref(Owner),
            attempts: ph.Int({ required: true }),
          },
        }),
        initialValue: {
          title: "",
          locked: false,
          status: "DRAFT",
          owner: null,
          attempts: 0,
        },
      },
      local: {
        schema: ph.object("NoteLocalState", { fields: { draft: ph.String() } }),
        initialValue: { draft: null },
      },
    },
  });
  const notes = note.module("notes", {
    operations: ({ global, local }) => ({
      setTitle: global({
        input: ph.input({
          fields: {
            title: ph.String({ required: true }),
            generation: ph.Int({ required: true, defaultValue: 0 }),
          },
        }),
        reduce(state, input) {
          state.title = input.title;
        },
      }),
      publish: global({
        input: ph.input({
          fields: { status: ph.ref(Status, { required: true }) },
        }),
        reduce(state, input) {
          state.status = input.status;
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
  return { note, notes };
}
export function protectedNote() {
  const { note, notes } = noteContext();
  const version = note.version({
    modules: [notes],
    auth: ({ operations, scopes, platform, policy: p }) => {
      const bindings = p.bindings({
        administrator: p.addressBinding({ source: "deployment" }),
        owner: p.addressBinding({ source: "instance" }),
        company: p.groupBinding({ source: "instance" }),
      });
      return p.initial({
        version: 1,
        bindings,
        grants: [
          p.allow({
            id: "admin",
            description: "Manage access",
            principal: bindings.administrator,
            target: p.executeMany([
              platform.auth.setGrant,
              platform.auth.removeGrant,
              platform.auth.moveGrant,
            ]),
          }),
          p.allow({
            id: "read",
            description: "Read note",
            principal: bindings.owner,
            target: p.read(scopes.global),
          }),
          p.allow({
            id: "edit",
            description: "Edit unlocked note",
            principal: bindings.owner,
            target: p.execute(operations.notes.setTitle),
            where: ({ state, input }) =>
              p.and(
                p.eq(state.locked, false),
                p.eq(input.generation, state.attempts),
              ),
          }),
          p.allow({
            id: "company",
            description: "Read company note",
            principal: bindings.company,
            target: p.read(scopes.global),
          }),
        ],
      });
    },
  });
  return { version, module: materialize(version) };
}
