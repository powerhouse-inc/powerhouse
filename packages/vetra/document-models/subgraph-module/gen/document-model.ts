import type { DocumentModelState } from "document-model";

export const documentModel: DocumentModelState = {
  id: "powerhouse/subgraph",
  name: "subgraph-module",
  extension: ".phdm",
  description: "",
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
          schema: "type SubgraphModuleState {\n  name: String!\n}",
          initialValue: '"{\\n  \\"name\\": \\"\\"\\n}"',
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
          id: "8af5bda9-6fc7-4427-bfed-1d32d76a552f",
          name: "base_operations",
          description: "",
          operations: [
            {
              id: "d7cd6b6b-01ea-42c8-97e2-288e04b50b42",
              name: "SET_SUBGRAPH_NAME",
              description: "",
              schema: "input SetSubgraphNameInput {\n  name: String!\n}",
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
