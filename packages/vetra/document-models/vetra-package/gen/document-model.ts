import type { DocumentModelState } from "document-model";

export const documentModel: DocumentModelState = {
  id: "vetra/package-information",
  name: "vetra-package",
  extension: ".phdm",
  description:
    "This document model defines the schema for PH package information, which is translated into the powerhouse.manifest.json file.",
  author: {
    name: "Powerhouse",
    website: "https://powerhouse.inc",
  },
  specifications: [
    {
      version: 1,
      changeLog: [],
      state: {
        global: {
          schema:
            "type VetraPackageState {\n  name: String!\n  description: String\n  category: String!\n  publisher: String\n  publisherUrl: URL\n  keywords: [String!]!\n  githubUrl: URL\n  npmUrl: URL\n}",
          initialValue:
            '"{\\n  \\"name\\": \\"\\",\\n  \\"description\\": null,\\n  \\"category\\": \\"\\",\\n  \\"publisher\\": null,\\n  \\"publisherUrl\\": null,\\n  \\"keywords\\": [],\\n  \\"githubUrl\\": null,\\n  \\"npmUrl\\": null\\n}"',
          examples: [],
        },
        local: {
          schema: "",
          initialValue: '""',
          examples: [],
        },
      },
      modules: [
        {
          id: "501c9550-6455-47cc-94fe-2e9366c3cbcf",
          name: "package_operations",
          description: "",
          operations: [
            {
              id: "5d36f63e-2d2e-4dba-a882-d8b2b8721f45",
              name: "SET_PACKAGE_NAME",
              description: "sets the package name",
              schema: "input SetPackageNameInput {\n  name: String!\n}",
              template: "",
              reducer: "",
              errors: [],
              examples: [],
              scope: "global",
            },
            {
              id: "f1666f28-1ebe-4491-b8d7-2b8727129b82",
              name: "SET_PACKAGE_DESCRIPTION",
              description: "sets the package description",
              schema:
                "input SetPackageDescriptionInput {\n  description: String\n}",
              template: "",
              reducer: "",
              errors: [],
              examples: [],
              scope: "global",
            },
            {
              id: "0c235479-cab6-463a-86e6-85e4d9f8074f",
              name: "SET_PACKAGE_CATEGORY",
              description: "sets package category",
              schema: "input SetPackageCategoryInput {\n  category: String!\n}",
              template: "",
              reducer: "",
              errors: [],
              examples: [],
              scope: "global",
            },
            {
              id: "d36fb748-bc44-4bad-8f15-b9f5f9909393",
              name: "SET_PACKAGE_PUBLISHER",
              description: "sets package publisher",
              schema:
                "input SetPackagePublisherInput {\n  publisher: String\n}",
              template: "",
              reducer: "",
              errors: [],
              examples: [],
              scope: "global",
            },
            {
              id: "355e0e17-94d1-4d30-95c0-de98089dafa0",
              name: "SET_PACKAGE_PUBLISHER_URL",
              description: "sets package publisher url",
              schema: "input SetPackagePublisherUrlInput {\n  url: URL\n}",
              template: "",
              reducer: "",
              errors: [],
              examples: [],
              scope: "global",
            },
            {
              id: "977d18f8-d459-4beb-8eba-bf4300ae0e85",
              name: "SET_PACKAGE_KEYWORDS",
              description: "set package keywords",
              schema:
                "input SetPackageKeywordsInput {\n  keywords: [String!]!\n}",
              template: "",
              reducer: "",
              errors: [],
              examples: [],
              scope: "global",
            },
            {
              id: "35548fb6-7867-44f0-bf48-756603b809a8",
              name: "SET_PACKAGE_GITHUB_URL",
              description: "sets package github url",
              schema: "input SetPackageGithubUrlInput {\n  url: URL\n}",
              template: "",
              reducer: "",
              errors: [],
              examples: [],
              scope: "global",
            },
            {
              id: "3e52527b-5bcb-4ef4-9aed-0f61e261cd0e",
              name: "SET_PACKAGE_NPM_URL",
              description: "sets package npm url",
              schema: "input SetPackageNpmUrlInput {\n  url: URL\n}",
              template: "",
              reducer: "",
              errors: [],
              examples: [],
              scope: "global",
            },
          ],
        },
      ],
    },
  ],
};
