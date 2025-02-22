import type { DocumentModelState } from "document-model/document-model";

export const documentModel: DocumentModelState = {
  id: "makerdao/scope-framework",
  name: "ScopeFramework",
  extension: "mdsf",
  description:
    "The MakerDAO Scope Framework document contains articles, sections and other elements that make up the governance rules for the MakerDAO scopes.",
  author: {
    name: "MakerDAO",
    website: "https://www.makerdao.com/",
  },
  specifications: [
    {
      version: 1,
      changeLog: [],
      modules: [
        {
          name: "main",
          operations: [
            {
              name: "SetRootPath",
              id: "",
              description: "",
              schema: "type SetRootPathInput {\n    newRootPath: String!\n}",
              template: "",
              reducer: "",
              examples: [],
              errors: [],
              scope: "global",
            },
            {
              name: "AddElement",
              id: "",
              description: "",
              schema:
                "type AddElementInput {\n    id: String!\n    path: String!\n    type: ScopeFrameworkElementType!\n    name: String\n    components: ElementComponents\n}",
              template: "",
              reducer: "",
              examples: [],
              errors: [],
              scope: "global",
            },
            {
              name: "UpdateElementType",
              id: "",
              description: "",
              schema:
                "type UpdateElementTypeInput {\n    id: ID!\n    type: ScopeFrameworkElementType!\n}",
              template: "",
              reducer: "",
              examples: [],
              errors: [],
              scope: "global",
            },
            {
              name: "UpdateElementName",
              id: "",
              description: "",
              schema:
                "type UpdateElementNameInput {\n    id: ID!\n    name: String\n}",
              template: "",
              reducer: "",
              examples: [],
              errors: [],
              scope: "global",
            },
            {
              name: "UpdateElementComponents",
              id: "",
              description: "",
              schema:
                "type UpdateElementComponentsInput {\n    id: ID!\n    components: ElementComponents\n}",
              template: "",
              reducer: "",
              examples: [],
              errors: [],
              scope: "global",
            },
            {
              name: "RemoveElement",
              id: "",
              description: "",
              schema: "type RemoveElementInput {\n    id: ID!\n}",
              template: "",
              reducer: "",
              examples: [],
              errors: [],
              scope: "global",
            },
            {
              name: "ReorderElements",
              id: "",
              description: "",
              schema:
                "type ReorderElementsInput {\n    parentElementId: ID!\n    order: [ID!]!\n}",
              template: "",
              reducer: "",
              examples: [],
              errors: [],
              scope: "global",
            },
            {
              name: "MoveElement",
              id: "",
              description: "",
              schema:
                "type MoveElementInput {\n    id: ID!\n    newParentId: ID!\n}",
              template: "",
              reducer: "",
              examples: [],
              errors: [],
              scope: "global",
            },
          ],
          id: "",
          description: "",
        },
      ],
      state: {
        global: {
          schema:
            "type ScopeComponent {\n    content: String\n}\n                    \ntype  ArticleComponent {\n    content: String\n}\n                    \ntype  SectionComponent {\n    content: String\n}\n                    \ntype  CoreComponent {\n    content: String\n}\n                    \nenum TypeSpecificationComponentCategory {\n    Primary\n    Supporting\n    Immutable\n    Accessory\n}\n                    \ntype  TypeSpecificationComponent {\n    name: String\n    overview: String\n    category: TypeSpecificationComponentCategory\n    documentIdentifierRules: String\n    typeAuthority: String\n    additionalLogic: String\n}\n                    \nunion ElementComponents = \n        ScopeComponent\n    |   ArticleComponent\n    |   SectionComponent\n    |   CoreComponent\n    |   TypeSpecificationComponent\n                    \nenum ScopeFrameworkElementType {\n    Scope\n    Article\n    Section\n    Core\n    TypeSpecification\n}\n                    \ntype  ScopeFrameworkElement {\n    id: ID!\n    path: String!\n    version: Int!\n    name: String\n    type: ScopeFrameworkElementType\n    components: ElementComponents\n}\n                    \ntype  ScopeFrameworkState {\n    rootPath: String!\n    elements: [ScopeFrameworkElement!]!\n}",
          initialValue:
            '"{\\n    \\"rootPath\\": \\"A\\",\\n    \\"elements\\": [\\n        {\\n            \\"id\\": \\"hruFam5ot7s0Gb1n+aIBa+y+NJA=\\",\\n            \\"name\\": \\"Scope Name\\",\\n            \\"version\\": 1,\\n            \\"type\\": \\"Scope\\",\\n            \\"path\\": \\"A.1\\",\\n            \\"components\\": {\\n                \\"content\\": \\"Scope description goes here.\\"\\n            }\\n        }\\n    ]\\n}"',
          examples: [],
        },
        local: {
          schema: "type ScopeFrameworkLocalState",
          initialValue: '"{}"',
          examples: [],
        },
      },
    },
  ],
};
