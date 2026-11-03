import {
  defineDocumentModel,
  materialize,
  ph,
} from "../../../src/definition/index.js";

const ReactorGroupState = ph.object("ReactorGroupState", {
  description:
    "A member address list gated by the group document's own auth scope. Addresses\nare stored as given and compared case-insensitively, matching how { address }\nprincipals are compared during auth evaluation.",
  fields: {
    name: ph.String({
      required: true,
      description: "Display name of the group.",
    }),
    description: ph.String({
      required: true,
      description: "Free-text description of the group's purpose.",
    }),
    members: ph.list(ph.String({ required: true }), {
      required: true,
      description:
        "Member wallet addresses. No duplicates under case-insensitive comparison.",
    }),
  },
});

const context = defineDocumentModel({
  id: "powerhouse/reactor-group",
  name: "Reactor Group",
  description:
    "A group of member addresses referenced by { group } principals in the auth scope. Group membership is folded at an operation's position during auth evaluation, so reducers are strict and deterministic: duplicate or unknown members are errors, and membership is capped.",
  extension: ".phrg",
  version: 1,
  author: { name: "Powerhouse", website: "https://powerhouse.inc" },
  scopes: {
    global: {
      schema: ReactorGroupState,
      initialValue: { name: "", description: "", members: [] },
    },
    local: { schema: null, initialValue: {} },
  },
});

const group = context.module("group", {
  description: "Manage the group's identity and its member address list.",
  operations: ({ global }) => ({
    setGroupName: global({
      description:
        "Set the display name of the group. The name must be non-empty after trimming and at most 200 characters.",
      input: ph.input({
        fields: {
          name: ph.String({ required: true }),
        },
      }),
      errors: {
        InvalidGroupName: {
          code: "InvalidGroupName",
          name: "InvalidGroupName",
          description:
            "The group name is empty after trimming or longer than 200 characters.",
          template: "",
        },
      },
      template: "",
      reducerTemplate: "",
      reduce() {},
    }),
    setGroupDescription: global({
      description:
        "Set the free-text description of the group. The description is at most 2000 characters.",
      input: ph.input({
        fields: {
          description: ph.String({ required: true }),
        },
      }),
      errors: {
        InvalidGroupDescription: {
          code: "InvalidGroupDescription",
          name: "InvalidGroupDescription",
          description: "The group description is longer than 2000 characters.",
          template: "",
        },
      },
      template: "",
      reducerTemplate: "",
      reduce() {},
    }),
    addMember: global({
      description:
        "Add a member address to the group. The address must be non-empty after trimming, must not already be a member under case-insensitive comparison, and the group must be below the member cap.",
      input: ph.input({
        fields: {
          address: ph.String({ required: true }),
        },
      }),
      errors: {
        InvalidMemberAddress: {
          code: "InvalidMemberAddress",
          name: "InvalidMemberAddress",
          description: "The member address is empty after trimming.",
          template: "",
        },
        DuplicateMember: {
          code: "DuplicateMember",
          name: "DuplicateMember",
          description:
            "The address is already a member of the group under case-insensitive comparison.",
          template: "",
        },
        GroupMemberLimitExceeded: {
          code: "GroupMemberLimitExceeded",
          name: "GroupMemberLimitExceeded",
          description: "The group already holds the maximum number of members.",
          template: "",
        },
      },
      template: "",
      reducerTemplate: "",
      reduce() {},
    }),
    removeMember: global({
      description:
        "Remove a member address from the group, matched case-insensitively. Removing an address that is not a member is an error.",
      input: ph.input({
        fields: {
          address: ph.String({ required: true }),
        },
      }),
      errors: {
        MemberNotFound: {
          code: "MemberNotFound",
          name: "MemberNotFound",
          description:
            "The address is not a member of the group under case-insensitive comparison.",
          template: "",
        },
      },
      template: "",
      reducerTemplate: "",
      reduce() {},
    }),
  }),
});

export const reactorGroup = materialize(context.version({ modules: [group] }));
