import {
  defineDocumentModel,
  materialize,
  ph,
} from "../../../src/definition/index.js";

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

const VetraPackageState = ph.object("VetraPackageState", {
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
      description: "Public source code URL (typically a GitHub repository).",
    }),
    npmUrl: ph.URL({
      description:
        "Published npm package URL. Set once the package has been released.",
    }),
  },
});

const context = defineDocumentModel({
  id: "powerhouse/package",
  name: "Vetra Package",
  description:
    "Manifest for a Vetra Reactor Package: bundles the metadata (name, description, category, author, keywords, source links) used to publish and discover the package in the Powerhouse ecosystem. Create one Vetra Package document per project; the document models, editors, processors, and subgraphs you add to the project are registered against this package at build time.",
  extension: ".pkg",
  version: 1,
  author: { name: "Powerhouse", website: "https://powerhouse.inc" },
  scopes: {
    global: {
      schema: VetraPackageState,
      initialValue: {
        name: null,
        description: null,
        category: null,
        author: { name: null, website: null },
        keywords: [],
        githubUrl: null,
        npmUrl: null,
      },
    },
    local: { schema: null, initialValue: {} },
  },
});

const baseOperations = context.module("baseOperations", {
  description:
    "Setters for the package's identity, author, keywords, and source/distribution links.",
  operations: ({ global }) => ({
    setPackageName: global({
      description:
        "Set the human-readable package name shown in listings and the Connect UI.",
      input: ph.input({
        fields: {
          name: ph.String({ required: true }),
        },
      }),
      template: "",
      reducerTemplate: "",
      reduce() {},
    }),
    setPackageDescription: global({
      description:
        "Set the one-paragraph summary describing what the package does.",
      input: ph.input({
        fields: {
          description: ph.String({ required: true }),
        },
      }),
      template: "",
      reducerTemplate: "",
      reduce() {},
    }),
    setPackageCategory: global({
      description:
        'Set the category label used to group the package in directories (e.g. "Finance", "Productivity").',
      input: ph.input({
        fields: {
          category: ph.String({ required: true }),
        },
      }),
      template: "",
      reducerTemplate: "",
      reduce() {},
    }),
    setPackageAuthor: global({
      description:
        "Replace the author block in a single call. Either field may be omitted to clear it.",
      input: ph.input({
        fields: {
          name: ph.OID(),
          website: ph.URL(),
        },
      }),
      template: "",
      reducerTemplate: "",
      reduce() {},
    }),
    setPackageAuthorName: global({
      description:
        "Set only the author's display name without touching the website field.",
      input: ph.input({
        fields: {
          name: ph.String({ required: true }),
        },
      }),
      template: "",
      reducerTemplate: "",
      reduce() {},
    }),
    setPackageAuthorWebsite: global({
      description:
        "Set only the author's website URL without touching the name field.",
      input: ph.input({
        fields: {
          website: ph.URL({ required: true }),
        },
      }),
      template: "",
      reducerTemplate: "",
      reduce() {},
    }),
    addPackageKeyword: global({
      description:
        "Append a search keyword. Caller supplies a stable id so the entry can be removed later.",
      input: ph.input({
        fields: {
          id: ph.String({ required: true }),
          label: ph.String({ required: true }),
        },
      }),
      template: "",
      reducerTemplate: "",
      reduce() {},
    }),
    removePackageKeyword: global({
      description:
        "Remove a keyword by its id. No-op if the id does not exist.",
      input: ph.input({
        fields: {
          id: ph.String({ required: true }),
        },
      }),
      template: "",
      reducerTemplate: "",
      reduce() {},
    }),
    setPackageGithubUrl: global({
      description:
        "Set the public source code URL (typically a GitHub repository).",
      input: ph.input({
        fields: {
          url: ph.URL({ required: true }),
        },
      }),
      template: "",
      reducerTemplate: "",
      reduce() {},
    }),
    setPackageNpmUrl: global({
      description:
        "Set the published npm package URL once the package has been released.",
      input: ph.input({
        fields: {
          url: ph.URL({ required: true }),
        },
      }),
      template: "",
      reducerTemplate: "",
      reduce() {},
    }),
  }),
});

export const vetraPackage = materialize(
  context.version({ modules: [baseOperations] }),
);
