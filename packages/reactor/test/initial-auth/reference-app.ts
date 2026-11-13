import {
  defineDocumentModel,
  groupDocumentType,
  materialize,
  ph,
} from "document-model";

const companyGroup = defineDocumentModel({
  id: groupDocumentType,
  name: "Reference company group",
  description:
    "Membership uses the existing group operations and manual auth path.",
  extension: "group",
  author: { name: "Reference application" },
  version: 1,
  scopes: {
    global: {
      schema: ph.object("ReferenceCompanyGroupState", {
        fields: {
          members: ph.list(ph.String({ required: true }), { required: true }),
        },
      }),
      initialValue: { members: [] },
    },
    local: { schema: null, initialValue: {} },
  },
});

export const referenceCompanyGroup = materialize(
  companyGroup.version({
    modules: [
      companyGroup.module("members", {
        operations: ({ global }) => ({
          addMember: global({
            input: ph.input({
              fields: { address: ph.String({ required: true }) },
            }),
            reduce(state, input) {
              if (!state.members.includes(input.address))
                state.members.push(input.address);
            },
          }),
          removeMember: global({
            input: ph.input({
              fields: { address: ph.String({ required: true }) },
            }),
            reduce(state, input) {
              state.members = state.members.filter(
                (address) => address !== input.address,
              );
            },
          }),
        }),
      }),
    ],
  }),
);

const note = defineDocumentModel({
  id: "initial-auth/reference-note",
  name: "Reference note",
  description: "An owner edits an unlocked note; administrators manage access.",
  extension: "note",
  author: { name: "Reference application" },
  version: 1,
  scopes: {
    global: {
      schema: ph.object("ReferenceNoteState", {
        fields: {
          title: ph.String({ required: true }),
          locked: ph.Boolean({ required: true }),
          archived: ph.Boolean({ required: true }),
        },
      }),
      initialValue: { title: "Draft", locked: false, archived: false },
    },
    local: {
      schema: ph.object("ReferenceNoteLocalState", {
        fields: { privateDraft: ph.String({ required: true }) },
      }),
      initialValue: { privateDraft: "PRIVATE_INITIAL_DRAFT" },
    },
  },
});

const notes = note.module("notes", {
  operations: ({ global }) => ({
    setTitle: global({
      input: ph.input({ fields: { title: ph.String({ required: true }) } }),
      reduce(state, input) {
        state.title = input.title;
      },
    }),
    setLocked: global({
      input: ph.input({ fields: { locked: ph.Boolean({ required: true }) } }),
      reduce(state, input) {
        state.locked = input.locked;
      },
    }),
    archive: global({
      input: ph.input({ fields: {} }),
      reduce(state) {
        state.archived = true;
      },
    }),
  }),
});

export const ReferenceNoteVersion = note.version({
  modules: [notes],
  auth: ({ operations, scopes, platform, policy: p }) => {
    const bindings = p.bindings({
      administrator: p.addressBinding({ source: "deployment" }),
      owner: p.addressBinding({ source: "instance" }),
    });
    return p.initial({
      version: 1,
      bindings,
      grants: [
        p.allow({
          id: "administrator-access",
          description: "Manage instance access",
          principal: bindings.administrator,
          target: p.executeMany([
            platform.auth.setGrant,
            platform.auth.removeGrant,
            platform.auth.moveGrant,
          ]),
        }),
        p.allow({
          id: "administrator-note",
          description: "Administer the note",
          principal: bindings.administrator,
          target: p.allOperations(scopes.global),
        }),
        p.allow({
          id: "administrator-draft",
          description: "Read the private draft",
          principal: bindings.administrator,
          target: p.read(scopes.local),
        }),
        p.allow({
          id: "owner-read",
          description: "Read the note",
          principal: bindings.owner,
          target: p.read(scopes.global),
        }),
        p.allow({
          id: "owner-title",
          description: "Edit the title while unlocked",
          principal: bindings.owner,
          target: p.execute(operations.notes.setTitle),
          where: ({ state }) => p.eq(state.locked, false),
        }),
      ],
    });
  },
});

export const referenceNote = materialize(ReferenceNoteVersion);

const profile = defineDocumentModel({
  id: "initial-auth/reference-profile",
  name: "Reference profile",
  description: "An invitation has no owner until a trusted service claims it.",
  extension: "profile",
  author: { name: "Reference application" },
  version: 1,
  scopes: {
    global: {
      schema: ph.object("ReferenceProfileState", {
        fields: {
          ownerAddress: ph.String(),
          displayName: ph.String({ required: true }),
        },
      }),
      initialValue: { ownerAddress: null, displayName: "Invited user" },
    },
    local: { schema: null, initialValue: {} },
  },
});

const profiles = profile.module("profiles", {
  operations: ({ global }) => ({
    claim: global({
      input: ph.input({
        fields: { ownerAddress: ph.String({ required: true }) },
      }),
      reduce(state, input) {
        if (state.ownerAddress !== null) throw new Error("Already claimed");
        state.ownerAddress = input.ownerAddress;
      },
    }),
    setDisplayName: global({
      input: ph.input({
        fields: { displayName: ph.String({ required: true }) },
      }),
      reduce(state, input) {
        state.displayName = input.displayName;
      },
    }),
  }),
});

export const ReferenceProfileVersion = profile.version({
  modules: [profiles],
  auth: ({ operations, scopes, platform, policy: p }) => {
    const bindings = p.bindings({
      administrator: p.addressBinding({ source: "deployment" }),
      service: p.addressBinding({ source: "deployment" }),
    });
    return p.initial({
      version: 1,
      bindings,
      grants: [
        p.allow({
          id: "administrator-access",
          description: "Manage profile access",
          principal: bindings.administrator,
          target: p.executeMany([
            platform.auth.setGrant,
            platform.auth.removeGrant,
            platform.auth.moveGrant,
          ]),
        }),
        p.allow({
          id: "service-claim",
          description: "Claim a verified invitation",
          principal: bindings.service,
          target: p.execute(operations.profiles.claim),
          where: ({ state }) => p.eq(state.ownerAddress, null),
        }),
        p.allow({
          id: "holder-read",
          description: "The claimed holder reads the profile",
          principal: p.anyone(),
          target: p.read(scopes.global),
          where: ({ state, subject }) =>
            p.and(
              p.exists(subject.address),
              p.ne(state.ownerAddress, null),
              p.eq(state.ownerAddress, subject.address),
            ),
        }),
        p.allow({
          id: "holder-name",
          description: "The claimed holder edits their display name",
          principal: ({ state, subject }) =>
            p.and(
              p.exists(subject.address),
              p.ne(state.ownerAddress, null),
              p.eq(state.ownerAddress, subject.address),
            ),
          target: p.execute(operations.profiles.setDisplayName),
        }),
      ],
    });
  },
});

export const referenceProfile = materialize(ReferenceProfileVersion);

const statement = defineDocumentModel({
  id: "initial-auth/reference-statement",
  name: "Reference statement",
  description:
    "Company members read a statement and a worker completes its current attempt.",
  extension: "statement",
  author: { name: "Reference application" },
  version: 1,
  scopes: {
    global: {
      schema: ph.object("ReferenceStatementState", {
        fields: {
          companyId: ph.String({ required: true }),
          status: ph.ref(
            ph.enum("ReferenceStatementStatus", {
              values: ["QUEUED", "PROCESSING", "COMPLETE"],
            }),
            { required: true },
          ),
          processing: ph.ref(
            ph.object("ReferenceProcessingAttempt", {
              fields: {
                generation: ph.String({ required: true }),
                attempt: ph.Int({ required: true }),
              },
            }),
            { required: true },
          ),
          total: ph.Int({ required: true }),
        },
      }),
      initialValue: {
        companyId: "company-a",
        status: "QUEUED",
        processing: { generation: "initial", attempt: 0 },
        total: 0,
      },
    },
    local: { schema: null, initialValue: {} },
  },
});

const processing = statement.module("processing", {
  operations: ({ global }) => ({
    start: global({
      input: ph.input({
        fields: {
          generation: ph.String({ required: true }),
          attempt: ph.Int({ required: true }),
        },
      }),
      reduce(state, input) {
        state.status = "PROCESSING";
        state.processing = {
          generation: input.generation,
          attempt: input.attempt,
        };
      },
    }),
    complete: global({
      input: ph.input({
        fields: {
          generation: ph.String({ required: true }),
          attempt: ph.Int({ required: true }),
          total: ph.Int({ required: true }),
        },
      }),
      reduce(state, input) {
        if (input.total < 0) throw new Error("Total must be nonnegative");
        state.total = input.total;
        state.status = "COMPLETE";
      },
    }),
  }),
});

export const ReferenceStatementVersion = statement.version({
  modules: [processing],
  auth: ({ operations, scopes, platform, policy: p }) => {
    const bindings = p.bindings({
      administrator: p.addressBinding({ source: "deployment" }),
      service: p.addressBinding({ source: "deployment" }),
      companyMembers: p.groupBinding({ source: "instance" }),
      worker: p.addressBinding({ source: "instance" }),
    });
    return p.initial({
      version: 1,
      bindings,
      grants: [
        p.allow({
          id: "administrator-access",
          description: "Manage statement access",
          principal: bindings.administrator,
          target: p.executeMany([
            platform.auth.setGrant,
            platform.auth.removeGrant,
            platform.auth.moveGrant,
          ]),
        }),
        p.allow({
          id: "service-start",
          description: "Start a processing attempt",
          principal: bindings.service,
          target: p.execute(operations.processing.start),
        }),
        p.allow({
          id: "company-read",
          description: "Company members read their statements",
          principal: bindings.companyMembers,
          target: p.read(scopes.global),
        }),
        p.allow({
          id: "worker-read",
          description: "The assigned worker reads the statement",
          principal: bindings.worker,
          target: p.read(scopes.global),
        }),
        p.allow({
          id: "worker-complete",
          description: "Complete only the current processing attempt",
          principal: bindings.worker,
          target: p.execute(operations.processing.complete),
          where: ({ state, input }) =>
            p.and(
              p.eq(state.status, "PROCESSING"),
              p.eq(input.generation, state.processing.generation),
              p.eq(input.attempt, state.processing.attempt),
            ),
        }),
      ],
    });
  },
});

export const referenceStatement = materialize(ReferenceStatementVersion);
