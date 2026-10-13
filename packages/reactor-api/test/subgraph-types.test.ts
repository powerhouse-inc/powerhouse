import type { IReactorClient } from "@powerhousedao/reactor";
import type { DocumentModelGlobalState } from "@powerhousedao/shared/document-model";
import { print } from "graphql";
import { gql } from "graphql-tag";
import { describe, expect, it } from "vitest";
import { DefaultCoreSubgraphs } from "../src/config.js";
import { AuthSubgraph } from "../src/graphql/auth/subgraph.js";
import type { IReactorInspectionSource } from "../src/graphql/inspection/source.js";
import { InspectionSubgraph } from "../src/graphql/inspection/subgraph.js";
import { ReactorSubgraph } from "../src/graphql/reactor/subgraph.js";
import {
  coreSubgraphTypeDefs,
  DOCUMENT_MODEL_SCHEMA_OWNER,
  findSubgraphTypeConflicts,
} from "../src/graphql/subgraph-types.js";
import type { SubgraphArgs } from "../src/graphql/types.js";

const todoList = {
  name: "TodoList",
  id: "test/todo-list",
  specifications: [
    {
      version: 1,
      modules: [],
      state: {
        global: { schema: "type TodoListState { title: String }" },
        local: { schema: "" },
      },
    },
  ],
} as unknown as DocumentModelGlobalState;

const revision = gql`
  type Revision {
    scope: String!
    revision: Int!
  }
`;

describe("coreSubgraphTypeDefs", () => {
  it("matches the typeDefs of every core subgraph the server registers", () => {
    const args = {
      reactorClient: {} as IReactorClient,
      graphqlManager: { setAdditionalContextFields: () => undefined },
      inspection: {} as IReactorInspectionSource,
    } as unknown as SubgraphArgs;
    const core = [
      ...DefaultCoreSubgraphs,
      ReactorSubgraph,
      InspectionSubgraph,
      AuthSubgraph,
    ].map((Subgraph) => new Subgraph(args));

    expect(
      Object.fromEntries(
        Array.from(coreSubgraphTypeDefs, ([name, typeDefs]) => [
          name,
          print(typeDefs),
        ]),
      ),
    ).toEqual(
      Object.fromEntries(
        core.map((subgraph) => [subgraph.name, print(subgraph.typeDefs)]),
      ),
    );
  });
});

describe("findSubgraphTypeConflicts", () => {
  it("is silent on the custom subgraph template next to its model", () => {
    const typeDefs = gql`
      type TodoListSubgraphQueries {
        example(driveId: String!): String
      }
      type Query {
        todoList: TodoListSubgraphQueries!
      }
    `;

    expect(findSubgraphTypeConflicts(typeDefs, [todoList])).toEqual([]);
  });

  it("is silent on an identical copy of a core type", () => {
    expect(findSubgraphTypeConflicts(revision, [todoList])).toEqual([]);
  });

  it("reports a type the model's own subgraph generates", () => {
    const typeDefs = gql`
      type TodoListQueries {
        example(driveId: String!): String
      }
      type Query {
        todoList: TodoListQueries!
      }
    `;

    expect(findSubgraphTypeConflicts(typeDefs, [todoList])).toEqual([
      { claim: "TodoListQueries", owner: "todo-list" },
    ]);
  });

  it("reports a model's generated document type", () => {
    const typeDefs = gql`
      type TodoList {
        id: ID
      }
    `;

    expect(findSubgraphTypeConflicts(typeDefs, [todoList])).toEqual([
      { claim: "TodoList", owner: "todo-list" },
    ]);
  });

  it("reports a type every generated schema reserves", () => {
    const typeDefs = gql`
      type Operation {
        id: ID
      }
    `;

    expect(findSubgraphTypeConflicts(typeDefs, [])).toEqual([
      { claim: "Operation", owner: DOCUMENT_MODEL_SCHEMA_OWNER },
    ]);
  });

  it("reports a core type and root field defined differently", () => {
    const typeDefs = gql`
      type Revision {
        id: ID
      }
      type Query {
        system: String
      }
    `;

    expect(findSubgraphTypeConflicts(typeDefs, [])).toEqual([
      { claim: "Query.system", owner: "system" },
      { claim: "Revision", owner: "r" },
    ]);
  });
});
