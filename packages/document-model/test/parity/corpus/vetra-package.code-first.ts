/**
 * The code-first declaration of vetra-package, equivalent to the stored
 * schema-first model in this repository down to every persisted byte.
 *
 * Reducers are empty: this fixture proves specification equality, which is
 * what `test/parity` compares. `test/replay` covers replay behavior with
 * its own pair.
 */
import { ph } from "../../../src/definition/field.js";
import { schemaFirstSpecification } from "../../../src/definition/compatibility.js";
import { defineDocumentModel } from "../../../src/definition/model.js";

const Author = ph.object("Author", {
  description: "Author/maintainer of the Vetra Package.",
  fields: {
    name: ph.String({
      description: "Display name of the author or organization.",
    }),
    website: ph.URL({ description: "Author's website URL." }),
  },
});

const Keyword = ph.object("Keyword", {
  description: "A single search keyword attached to the package.",
  fields: {
    id: ph.OID({
      required: true,
      description:
        "Stable identifier for the keyword entry; used to remove it.",
    }),
    label: ph.String({
      required: true,
      description: "Display label for the keyword (e.g. 'invoicing', 'defi').",
    }),
  },
});

const contextV1 = defineDocumentModel({
  id: "powerhouse/package",
  name: "Vetra Package",
  description:
    "Manifest for a Vetra Reactor Package: bundles the metadata (name, description, category, author, keywords, source links) used to publish and discover the package in the Powerhouse ecosystem. Create one Vetra Package document per project; the document models, editors, processors, and subgraphs you add to the project are registered against this package at build time.",
  extension: ".pkg",
  version: 1,
  author: { name: "Powerhouse", website: "https://powerhouse.inc" },
  specifications: {
    global: {
      schema: ph.object("VetraPackageState", {
        description:
          "Package metadata used to publish a Vetra Reactor Package to npm and surface\nit inside Connect/Switchboard. All fields are optional so a package can be\ncreated empty and filled in incrementally during development.",
        fields: {
          name: ph.String({
            description:
              "Human-readable package name (e.g. 'Pizza Plaza'). Distinct from the npm package id.",
          }),
          description: ph.String({
            description:
              "One-paragraph summary of what the package provides. Shown on package listing pages.",
          }),
          category: ph.String({
            description:
              "Free-form category label used to group packages in directories (e.g. 'Finance', 'Productivity').",
          }),
          author: ph.ref(Author, {
            required: true,
            description:
              "Author/maintainer information surfaced in the published package metadata.",
          }),
          keywords: ph.list(ph.ref(Keyword, { required: true }), {
            required: true,
            description:
              "Search keywords associated with the package. Each keyword has a stable id so it can be removed individually.",
          }),
          githubUrl: ph.URL({
            description:
              "Public source code URL (typically a GitHub repository).",
          }),
          npmUrl: ph.URL({
            description:
              "Published npm package URL. Set once the package has been released.",
          }),
        },
      }),
      initialValue: {
        name: null,
        description: null,
        category: null,
        author: {
          name: null,
          website: null,
        },
        keywords: [],
        githubUrl: null,
        npmUrl: null,
      },
    },
    local: {
      schema: null,
      initialValue: {},
    },
  },
});

const baseOperationsV1 = contextV1.module("baseOperations", {
  description:
    "Setters for the package's identity, author, keywords, and source/distribution links.",
  operations: ({ global }) => ({
    setPackageName: global({
      input: ph.input({
        fields: {
          name: ph.String({ required: true }),
        },
      }),
      description:
        "Set the human-readable package name shown in listings and the Connect UI.",
      template: "",
      reducerTemplate: "",
      reduce() {},
    }),
    setPackageDescription: global({
      input: ph.input({
        fields: {
          description: ph.String({ required: true }),
        },
      }),
      description:
        "Set the one-paragraph summary describing what the package does.",
      template: "",
      reducerTemplate: "",
      reduce() {},
    }),
    setPackageCategory: global({
      input: ph.input({
        fields: {
          category: ph.String({ required: true }),
        },
      }),
      description:
        'Set the category label used to group the package in directories (e.g. "Finance", "Productivity").',
      template: "",
      reducerTemplate: "",
      reduce() {},
    }),
    setPackageAuthor: global({
      input: ph.input({
        fields: {
          name: ph.OID(),
          website: ph.URL(),
        },
      }),
      description:
        "Replace the author block in a single call. Either field may be omitted to clear it.",
      template: "",
      reducerTemplate: "",
      reduce() {},
    }),
    setPackageAuthorName: global({
      input: ph.input({
        fields: {
          name: ph.String({ required: true }),
        },
      }),
      description:
        "Set only the author's display name without touching the website field.",
      template: "",
      reducerTemplate: "",
      reduce() {},
    }),
    setPackageAuthorWebsite: global({
      input: ph.input({
        fields: {
          website: ph.URL({ required: true }),
        },
      }),
      description:
        "Set only the author's website URL without touching the name field.",
      template: "",
      reducerTemplate: "",
      reduce() {},
    }),
    addPackageKeyword: global({
      input: ph.input({
        fields: {
          id: ph.String({ required: true }),
          label: ph.String({ required: true }),
        },
      }),
      description:
        "Append a search keyword. Caller supplies a stable id so the entry can be removed later.",
      template: "",
      reducerTemplate: "",
      reduce() {},
    }),
    removePackageKeyword: global({
      input: ph.input({
        fields: {
          id: ph.String({ required: true }),
        },
      }),
      description:
        "Remove a keyword by its id. No-op if the id does not exist.",
      template: "",
      reducerTemplate: "",
      reduce() {},
    }),
    setPackageGithubUrl: global({
      input: ph.input({
        fields: {
          url: ph.URL({ required: true }),
        },
      }),
      description:
        "Set the public source code URL (typically a GitHub repository).",
      template: "",
      reducerTemplate: "",
      reduce() {},
    }),
    setPackageNpmUrl: global({
      input: ph.input({
        fields: {
          url: ph.URL({ required: true }),
        },
      }),
      description:
        "Set the published npm package URL once the package has been released.",
      template: "",
      reducerTemplate: "",
      reduce() {},
    }),
  }),
});

export const DefinitionV1 = contextV1.finalize({
  modules: [baseOperationsV1],
  compatibility: schemaFirstSpecification({
    ids: {
      "module/baseOperations": "a6156f32-8120-43a5-be8b-51c7feaa3460",
      "operation/baseOperations/setPackageName":
        "33f2eab7-9e07-497f-a4e6-53e50968c3c9",
      "operation/baseOperations/setPackageDescription":
        "a07bee80-c2a8-40d7-891b-822ee298d7d9",
      "operation/baseOperations/setPackageCategory":
        "f3ad82f8-580a-4c6e-b930-e203cda998bb",
      "operation/baseOperations/setPackageAuthor":
        "67f43579-ce98-47e6-bf48-27c0f44818b9",
      "operation/baseOperations/setPackageAuthorName":
        "94ba44c4-9627-405e-9ea2-34e9da1c283a",
      "operation/baseOperations/setPackageAuthorWebsite":
        "3d5c08df-6c14-480b-915b-875941979fd0",
      "operation/baseOperations/addPackageKeyword":
        "ed95f841-6fd0-4552-898d-e915599b7495",
      "operation/baseOperations/removePackageKeyword":
        "83c4db24-bd2f-424d-9e26-751580d6307b",
      "operation/baseOperations/setPackageGithubUrl":
        "83a90530-8535-4ea7-ab53-7865532398f7",
      "operation/baseOperations/setPackageNpmUrl":
        "e789859a-01ee-4b60-8e7e-a3ad928a26d1",
    },
    names: {
      "module/baseOperations": { storedName: "base_operations" },
      "operation/baseOperations/setPackageName": {
        storedName: "SET_PACKAGE_NAME",
      },
      "operation/baseOperations/setPackageDescription": {
        storedName: "SET_PACKAGE_DESCRIPTION",
      },
      "operation/baseOperations/setPackageCategory": {
        storedName: "SET_PACKAGE_CATEGORY",
      },
      "operation/baseOperations/setPackageAuthor": {
        storedName: "SET_PACKAGE_AUTHOR",
      },
      "operation/baseOperations/setPackageAuthorName": {
        storedName: "SET_PACKAGE_AUTHOR_NAME",
      },
      "operation/baseOperations/setPackageAuthorWebsite": {
        storedName: "SET_PACKAGE_AUTHOR_WEBSITE",
      },
      "operation/baseOperations/addPackageKeyword": {
        storedName: "ADD_PACKAGE_KEYWORD",
      },
      "operation/baseOperations/removePackageKeyword": {
        storedName: "REMOVE_PACKAGE_KEYWORD",
      },
      "operation/baseOperations/setPackageGithubUrl": {
        storedName: "SET_PACKAGE_GITHUB_URL",
      },
      "operation/baseOperations/setPackageNpmUrl": {
        storedName: "SET_PACKAGE_NPM_URL",
      },
    },
    serialization: {
      "state/global/schema":
        '"""\nPackage metadata used to publish a Vetra Reactor Package to npm and surface\nit inside Connect/Switchboard. All fields are optional so a package can be\ncreated empty and filled in incrementally during development.\n"""\ntype VetraPackageState {\n  """Human-readable package name (e.g. \'Pizza Plaza\'). Distinct from the npm package id."""\n  name: String\n  """One-paragraph summary of what the package provides. Shown on package listing pages."""\n  description: String\n  """Free-form category label used to group packages in directories (e.g. \'Finance\', \'Productivity\')."""\n  category: String\n  """Author/maintainer information surfaced in the published package metadata."""\n  author: Author!\n  """Search keywords associated with the package. Each keyword has a stable id so it can be removed individually."""\n  keywords: [Keyword!]!\n  """Public source code URL (typically a GitHub repository)."""\n  githubUrl: URL\n  """Published npm package URL. Set once the package has been released."""\n  npmUrl: URL\n}\n\n"""Author/maintainer of the Vetra Package."""\ntype Author {\n  """Display name of the author or organization."""\n  name: String\n  """Author\'s website URL."""\n  website: URL\n}\n\n"""A single search keyword attached to the package."""\ntype Keyword {\n  """Stable identifier for the keyword entry; used to remove it."""\n  id: OID!\n  """Display label for the keyword (e.g. \'invoicing\', \'defi\')."""\n  label: String!\n}',
      "state/global/initialValue":
        '{\n  "name": null,\n  "description": null,\n  "category": null,\n  "author": {\n    "name": null,\n    "website": null\n  },\n  "keywords": [],\n  "githubUrl": null,\n  "npmUrl": null\n}',
      "state/local/initialValue": "",
      "operation/baseOperations/setPackageName/schema":
        "input SetPackageNameInput {\n  name: String!\n}",
      "operation/baseOperations/setPackageDescription/schema":
        "input SetPackageDescriptionInput {\n  description: String!\n}",
      "operation/baseOperations/setPackageCategory/schema":
        "input SetPackageCategoryInput {\n  category: String!\n}",
      "operation/baseOperations/setPackageAuthor/schema":
        "input SetPackageAuthorInput {\n  name: OID\n  website: URL\n}",
      "operation/baseOperations/setPackageAuthorName/schema":
        "input SetPackageAuthorNameInput {\n  name: String!\n}",
      "operation/baseOperations/setPackageAuthorWebsite/schema":
        "input SetPackageAuthorWebsiteInput {\n  website: URL!\n}",
      "operation/baseOperations/addPackageKeyword/schema":
        "input AddPackageKeywordInput {\n  id: String!\n  label: String!\n}",
      "operation/baseOperations/removePackageKeyword/schema":
        "input RemovePackageKeywordInput {\n  id: String!\n}",
      "operation/baseOperations/setPackageGithubUrl/schema":
        "input SetPackageGithubUrlInput {\n  url: URL!\n}",
      "operation/baseOperations/setPackageNpmUrl/schema":
        "input SetPackageNpmUrlInput {\n  url: URL!\n}",
    },
  }),
});

export const modules = [DefinitionV1];
