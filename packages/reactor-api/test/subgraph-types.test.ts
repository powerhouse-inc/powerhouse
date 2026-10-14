import type { IReactorClient } from "@powerhousedao/reactor";
import type { DocumentModelGlobalState } from "@powerhousedao/shared/document-model";
import { print } from "graphql";
import { gql } from "graphql-tag";
import { describe, expect, it } from "vitest";
import { coreSubgraphClasses } from "../src/config.js";
import type { IReactorInspectionSource } from "../src/graphql/inspection/source.js";
import {
  coreSubgraphTypeDefs,
  DOCUMENT_MODEL_SCHEMA_OWNER,
  findPackageSubgraphConflicts,
  type PackageSubgraph,
} from "../src/graphql/subgraph-types.js";
import type { SubgraphArgs } from "../src/graphql/types.js";

function model(
  name: string,
  operationSchema = `input Set${name}TitleInput { title: String }`,
): DocumentModelGlobalState {
  return {
    name,
    id: `test/${name}`,
    specifications: [
      {
        version: 1,
        modules: operationSchema
          ? [
              {
                name: "base",
                operations: [
                  {
                    name: `SET_${name.toUpperCase()}_TITLE`,
                    schema: operationSchema,
                  },
                ],
              },
            ]
          : [],
        state: {
          global: { schema: `type ${name}State { title: String }` },
          local: { schema: "" },
        },
      },
    ],
  } as unknown as DocumentModelGlobalState;
}

const todoList = model("TodoList");

const template = (pascal: string, camel: string) => gql`
  type ${pascal}SubgraphQueries {
    example(driveId: String!): String
  }
  type Query {
    ${camel}: ${pascal}SubgraphQueries!
  }
`;

function conflicts(
  subgraphs: PackageSubgraph[],
  models: DocumentModelGlobalState[] = [todoList],
) {
  return Object.fromEntries(
    findPackageSubgraphConflicts(subgraphs, models).conflicts,
  );
}

describe("coreSubgraphTypeDefs", () => {
  it("matches the typeDefs of every core subgraph the server registers", () => {
    const args = {
      reactorClient: {} as IReactorClient,
      graphqlManager: { setAdditionalContextFields: () => undefined },
      inspection: {} as IReactorInspectionSource,
    } as unknown as SubgraphArgs;
    const core = coreSubgraphClasses({
      inspection: true,
      documentPermissions: true,
    }).map((Subgraph) => new Subgraph(args));

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

describe("findPackageSubgraphConflicts", () => {
  it("is silent on the template under a name of its own", () => {
    expect(
      conflicts([
        { name: "todo-tools", typeDefs: template("TodoTools", "todoTools") },
      ]),
    ).toEqual({});
  });

  it("is silent on an identical copy of a core type", () => {
    const typeDefs = gql`
      type Revision {
        scope: String!
        revision: Int!
      }
    `;

    expect(conflicts([{ name: "ledger", typeDefs }])).toEqual({});
  });

  it("refuses the name of a model's subgraph", () => {
    expect(
      conflicts([
        { name: "todo-list", typeDefs: template("TodoList", "todoList") },
      ]),
    ).toEqual({
      "todo-list": { kind: "name", heldBy: "document model" },
    });
  });

  it("refuses the name of a core subgraph", () => {
    expect(
      conflicts([{ name: "system", typeDefs: template("System", "sys") }]),
    ).toEqual({ system: { kind: "name", heldBy: "core" } });
  });

  it("leaves a model without operations unmounted, so its name is free", () => {
    expect(
      conflicts(
        [{ name: "todo-list", typeDefs: template("TodoList", "todoList") }],
        [model("TodoList", "")],
      ),
    ).toEqual({});
  });

  it("reports a type the model's own subgraph generates", () => {
    const typeDefs = gql`
      type TodoListQueries {
        example(driveId: String!): String
      }
      type Query {
        todoTools: TodoListQueries!
      }
    `;

    expect(conflicts([{ name: "todo-tools", typeDefs }])).toEqual({
      "todo-tools": {
        kind: "claims",
        claims: [
          {
            claim: "TodoListQueries",
            owner: "todo-list",
            ownerIsPackage: false,
          },
        ],
      },
    });
  });

  it("reports a type a base model's subgraph generates", () => {
    const typeDefs = gql`
      type DocumentModelQueries {
        example: String
      }
    `;

    expect(conflicts([{ name: "ledger", typeDefs }], [])).toEqual({
      ledger: {
        kind: "claims",
        claims: [
          {
            claim: "DocumentModelQueries",
            owner: "document-model",
            ownerIsPackage: false,
          },
        ],
      },
    });
  });

  it("reports a model's generated document type", () => {
    const typeDefs = gql`
      type TodoList {
        id: ID
      }
    `;

    expect(conflicts([{ name: "ledger", typeDefs }])).toEqual({
      ledger: {
        kind: "generated",
        claims: [{ claim: "TodoList", owner: "todo-list" }],
      },
    });
  });

  it("reports a type every generated schema reserves", () => {
    const typeDefs = gql`
      type Operation {
        id: ID
      }
    `;

    expect(conflicts([{ name: "ledger", typeDefs }], [])).toEqual({
      ledger: {
        kind: "generated",
        claims: [{ claim: "Operation", owner: DOCUMENT_MODEL_SCHEMA_OWNER }],
      },
    });
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

    expect(conflicts([{ name: "ledger", typeDefs }], [])).toEqual({
      ledger: {
        kind: "claims",
        claims: [
          { claim: "Query.system", owner: "system", ownerIsPackage: false },
          { claim: "Revision", owner: "r", ownerIsPackage: false },
        ],
      },
    });
  });

  it("gives a root field two package subgraphs define to the first", () => {
    const typeDefs = gql`
      type Query {
        ledger: String
      }
    `;

    expect(
      conflicts([
        { name: "ledger", typeDefs },
        { name: "ledger-copy", typeDefs },
      ]),
    ).toEqual({
      "ledger-copy": {
        kind: "claims",
        claims: [
          { claim: "Query.ledger", owner: "ledger", ownerIsPackage: true },
        ],
      },
    });
  });

  it("skips a model whose schema does not parse and checks the rest", () => {
    const report = findPackageSubgraphConflicts(
      [{ name: "todo-list", typeDefs: template("TodoList", "todoList") }],
      [todoList, model("Broken", "input BrokenInput {")],
    );

    expect(report.skippedModels).toEqual(["Broken"]);
    expect(Object.fromEntries(report.conflicts)).toEqual({
      "todo-list": { kind: "name", heldBy: "document model" },
    });
  });
});
