/**
 * The code-first declaration of reactor-group, equivalent to the stored
 * schema-first model in this repository down to every persisted byte.
 *
 * Reducers are empty: this fixture proves specification equality, which is
 * what `test/parity` compares. `test/replay` covers replay behavior with
 * its own pair.
 */
import { ph } from "../../../src/definition/field.js";
import { schemaFirstSpecification } from "../../../src/definition/compatibility.js";
import { defineDocumentModel } from "../../../src/definition/model.js";

const contextV1 = defineDocumentModel({
  id: "powerhouse/reactor-group",
  name: "Reactor Group",
  description:
    "A group of member addresses referenced by { group } principals in the auth scope. Group membership is folded at an operation's position during auth evaluation, so reducers are strict and deterministic: duplicate or unknown members are errors, and membership is capped.",
  extension: ".phrg",
  version: 1,
  author: { name: "Powerhouse", website: "https://powerhouse.inc" },
  specifications: {
    global: {
      schema: ph.object("ReactorGroupState", {
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
      }),
      initialValue: {
        name: "",
        description: "",
        members: [],
      },
    },
    local: {
      schema: null,
      initialValue: {},
    },
  },
});

const groupV1 = contextV1.module("group", {
  description: "Manage the group's identity and its member address list.",
  operations: ({ global }) => ({
    setGroupName: global({
      input: ph.input({
        fields: {
          name: ph.String({ required: true }),
        },
      }),
      description:
        "Set the display name of the group. The name must be non-empty after trimming and at most 200 characters.",
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
      input: ph.input({
        fields: {
          description: ph.String({ required: true }),
        },
      }),
      description:
        "Set the free-text description of the group. The description is at most 2000 characters.",
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
      input: ph.input({
        fields: {
          address: ph.String({ required: true }),
        },
      }),
      description:
        "Add a member address to the group. The address must be non-empty after trimming, must not already be a member under case-insensitive comparison, and the group must be below the member cap.",
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
      input: ph.input({
        fields: {
          address: ph.String({ required: true }),
        },
      }),
      description:
        "Remove a member address from the group, matched case-insensitively. Removing an address that is not a member is an error.",
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

export const DefinitionV1 = contextV1.finalize({
  modules: [groupV1],
  compatibility: schemaFirstSpecification({
    ids: {
      "module/group": "efd6d9bb-869e-4565-b1ca-d9b74385eaf7",
      "operation/group/setGroupName": "43da2b3d-bad7-40b8-8a84-4cdf892f1519",
      "error/group/setGroupName/InvalidGroupName":
        "8be0d16c-1f21-4d95-9536-c5a5867d2ba1",
      "operation/group/setGroupDescription":
        "aa493898-ce6b-4b28-baf3-1b6fd8425138",
      "error/group/setGroupDescription/InvalidGroupDescription":
        "9f0f77a4-6a86-4f5c-9a3f-13a44be29de3",
      "operation/group/addMember": "e7990be2-2e40-4624-9f96-df759703ba6b",
      "error/group/addMember/InvalidMemberAddress":
        "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
      "error/group/addMember/DuplicateMember":
        "b2c1a9de-58e6-4f3f-9f2a-7f6b1e2d4c5a",
      "error/group/addMember/GroupMemberLimitExceeded":
        "c4d5e6f7-0a1b-4c2d-8e3f-9a0b1c2d3e4f",
      "operation/group/removeMember": "b1309319-48b7-42b2-a40e-1fecef9a09a4",
      "error/group/removeMember/MemberNotFound":
        "d6e7f8a9-1b2c-4d3e-9f4a-0b1c2d3e4f5a",
    },
    names: {
      "module/group": { storedName: "group" },
      "operation/group/setGroupName": { storedName: "SET_GROUP_NAME" },
      "operation/group/setGroupDescription": {
        storedName: "SET_GROUP_DESCRIPTION",
      },
      "operation/group/addMember": { storedName: "ADD_MEMBER" },
      "operation/group/removeMember": { storedName: "REMOVE_MEMBER" },
    },
    serialization: {
      "state/global/schema":
        '"""\nA member address list gated by the group document\'s own auth scope. Addresses\nare stored as given and compared case-insensitively, matching how { address }\nprincipals are compared during auth evaluation.\n"""\ntype ReactorGroupState {\n  """Display name of the group."""\n  name: String!\n  """Free-text description of the group\'s purpose."""\n  description: String!\n  """Member wallet addresses. No duplicates under case-insensitive comparison."""\n  members: [String!]!\n}',
      "state/global/initialValue":
        '{\n  "name": "",\n  "description": "",\n  "members": []\n}',
      "state/local/initialValue": "",
      "operation/group/setGroupName/schema":
        "input SetGroupNameInput {\n  name: String!\n}",
      "operation/group/setGroupDescription/schema":
        "input SetGroupDescriptionInput {\n  description: String!\n}",
      "operation/group/addMember/schema":
        "input AddMemberInput {\n  address: String!\n}",
      "operation/group/removeMember/schema":
        "input RemoveMemberInput {\n  address: String!\n}",
    },
  }),
});

export const modules = [DefinitionV1];
