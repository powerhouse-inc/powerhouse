import type { DocumentModelGlobalState } from "document-model";

export const documentModel: DocumentModelGlobalState = {
  id: "powerhouse/reactor-group",
  name: "Reactor Group",
  author: {
    name: "Powerhouse",
    website: "https://powerhouse.inc",
  },
  extension: ".phrg",
  description:
    "A group of member addresses referenced by { group } principals in the auth scope. Group membership is folded at an operation's position during auth evaluation, so reducers are strict and deterministic: duplicate or unknown members are errors, and membership is capped.",
  specifications: [
    {
      state: {
        local: {
          schema: "",
          examples: [],
          initialValue: "",
        },
        global: {
          schema:
            '"""\nA member address list gated by the group document\'s own auth scope. Addresses\nare stored as given and compared case-insensitively, matching how { address }\nprincipals are compared during auth evaluation.\n"""\ntype ReactorGroupState {\n  """Display name of the group."""\n  name: String!\n  """Free-text description of the group\'s purpose."""\n  description: String!\n  """Member wallet addresses. No duplicates under case-insensitive comparison."""\n  members: [String!]!\n}',
          examples: [],
          initialValue:
            '{\n  "name": "",\n  "description": "",\n  "members": []\n}',
        },
      },
      modules: [
        {
          id: "efd6d9bb-869e-4565-b1ca-d9b74385eaf7",
          name: "group",
          description:
            "Manage the group's identity and its member address list.",
          operations: [
            {
              id: "43da2b3d-bad7-40b8-8a84-4cdf892f1519",
              name: "SET_GROUP_NAME",
              description:
                "Set the display name of the group. The name must be non-empty after trimming and at most 200 characters.",
              schema: "input SetGroupNameInput {\n  name: String!\n}",
              template: "",
              reducer: "",
              errors: [
                {
                  id: "8be0d16c-1f21-4d95-9536-c5a5867d2ba1",
                  code: "InvalidGroupName",
                  name: "InvalidGroupName",
                  description:
                    "The group name is empty after trimming or longer than 200 characters.",
                  template: "",
                },
              ],
              examples: [],
              scope: "global",
            },
            {
              id: "aa493898-ce6b-4b28-baf3-1b6fd8425138",
              name: "SET_GROUP_DESCRIPTION",
              description:
                "Set the free-text description of the group. The description is at most 2000 characters.",
              schema:
                "input SetGroupDescriptionInput {\n  description: String!\n}",
              template: "",
              reducer: "",
              errors: [
                {
                  id: "9f0f77a4-6a86-4f5c-9a3f-13a44be29de3",
                  code: "InvalidGroupDescription",
                  name: "InvalidGroupDescription",
                  description:
                    "The group description is longer than 2000 characters.",
                  template: "",
                },
              ],
              examples: [],
              scope: "global",
            },
            {
              id: "e7990be2-2e40-4624-9f96-df759703ba6b",
              name: "ADD_MEMBER",
              description:
                "Add a member address to the group. The address must be non-empty after trimming, must not already be a member under case-insensitive comparison, and the group must be below the member cap.",
              schema: "input AddMemberInput {\n  address: String!\n}",
              template: "",
              reducer: "",
              errors: [
                {
                  id: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
                  code: "InvalidMemberAddress",
                  name: "InvalidMemberAddress",
                  description: "The member address is empty after trimming.",
                  template: "",
                },
                {
                  id: "b2c1a9de-58e6-4f3f-9f2a-7f6b1e2d4c5a",
                  code: "DuplicateMember",
                  name: "DuplicateMember",
                  description:
                    "The address is already a member of the group under case-insensitive comparison.",
                  template: "",
                },
                {
                  id: "c4d5e6f7-0a1b-4c2d-8e3f-9a0b1c2d3e4f",
                  code: "GroupMemberLimitExceeded",
                  name: "GroupMemberLimitExceeded",
                  description:
                    "The group already holds the maximum number of members.",
                  template: "",
                },
              ],
              examples: [],
              scope: "global",
            },
            {
              id: "b1309319-48b7-42b2-a40e-1fecef9a09a4",
              name: "REMOVE_MEMBER",
              description:
                "Remove a member address from the group, matched case-insensitively. Removing an address that is not a member is an error.",
              schema: "input RemoveMemberInput {\n  address: String!\n}",
              template: "",
              reducer: "",
              errors: [
                {
                  id: "d6e7f8a9-1b2c-4d3e-9f4a-0b1c2d3e4f5a",
                  code: "MemberNotFound",
                  name: "MemberNotFound",
                  description:
                    "The address is not a member of the group under case-insensitive comparison.",
                  template: "",
                },
              ],
              examples: [],
              scope: "global",
            },
          ],
        },
      ],
      version: 1,
      changeLog: [],
    },
  ],
};
