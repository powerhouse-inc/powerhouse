import { boolean, flag, option, optional, positional, string } from "cmd-ts";
import { debugArgs } from "./common.js";

// `ph mutate`.
export const mutateArgs = {
  document: positional({
    type: optional(string),
    displayName: "document",
    description: "The document to change: its id or slug",
  }),
  type: positional({
    type: optional(string),
    displayName: "TYPE",
    description: "The action's type, as the document model names it (SET_NAME)",
  }),
  input: option({
    type: optional(string),
    long: "input",
    description: "The action's input as JSON (default: {})",
  }),
  inputFile: option({
    type: optional(string),
    long: "input-file",
    description: "A file holding the action's input as JSON",
  }),
  scope: option({
    type: optional(string),
    long: "scope",
    description: "The action's scope (default: global)",
  }),
  branch: option({
    type: optional(string),
    long: "branch",
    description: "The branch to write to (default: main)",
  }),
  actions: option({
    type: optional(string),
    long: "actions",
    description:
      "A JSON file with the actions to send, in order: an array of { type, input, scope }",
  }),
  create: option({
    type: optional(string),
    long: "create",
    description:
      "Create a document of this type (powerhouse/document-model); its model must be one ph-cli holds: a base model, the project's or a package's in powerhouse.config.json",
  }),
  parent: option({
    type: optional(string),
    long: "parent",
    description:
      "With --create: the drive (id or slug) to file the new document in",
  }),
  name: option({
    type: optional(string),
    long: "name",
    description: "With --create: the new document's name",
  }),
  delete: option({
    type: optional(string),
    long: "delete",
    description:
      "Delete this document (id or slug); the host removes the links to it and its drive entry",
  }),
  cascade: flag({
    type: optional(boolean),
    long: "cascade",
    description:
      "With --delete: also delete the documents only it holds (its children)",
  }),
  url: option({
    type: optional(string),
    long: "url",
    description:
      "The switchboard: its GraphQL endpoint or base URL (default: the one this project runs, from its run record)",
  }),
  json: flag({
    type: optional(boolean),
    long: "json",
    description: "Print JSON for scripts",
  }),
  ...debugArgs,
};
