import type { IReactorClient } from "@powerhousedao/reactor";
import type { DocumentModelGlobalState } from "@powerhousedao/shared/document-model";
import { constantCase } from "change-case";
import { print } from "graphql";
import { gql } from "graphql-tag";
import { describe, expect, it } from "vitest";
import { coreSubgraphClasses } from "../src/config.js";
import type { IReactorInspectionSource } from "../src/graphql/inspection/source.js";
import { coreSubgraphTypeDefs } from "../src/graphql/package-subgraph-check.js";
import {
  DOCUMENT_MODEL_SCHEMA_OWNER,
  findPackageSubgraphConflicts,
  type PackageSubgraph,
} from "../src/graphql/subgraph-types.js";
import type { SubgraphArgs } from "../src/graphql/types.js";

function model(
  name: string,
  operationSchema = `input Set${name}TitleInput { title: String }`,
  stateSchema = `type ${name}State { title: String }`,
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
                    name: `SET_${constantCase(name)}_TITLE`,
                    schema: operationSchema,
                  },
                ],
              },
            ]
          : [],
        state: {
          global: { schema: stateSchema },
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

async function conflicts(
  subgraphs: PackageSubgraph[],
  models: DocumentModelGlobalState[] = [todoList],
) {
  return Object.fromEntries(
    (await findPackageSubgraphConflicts(subgraphs, models)).conflicts,
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
  it("is silent on the template under a name of its own", async () => {
    expect(
      await conflicts([
        { name: "todo-tools", typeDefs: template("TodoTools", "todoTools") },
      ]),
    ).toEqual({});
  });

  it("is silent on an identical copy of a core type", async () => {
    const typeDefs = gql`
      type Revision {
        scope: String!
        revision: Int!
      }
    `;

    expect(await conflicts([{ name: "ledger", typeDefs }])).toEqual({});
  });

  it("refuses the name of a model's subgraph", async () => {
    expect(
      await conflicts([
        { name: "todo-list", typeDefs: template("TodoList", "todoList") },
      ]),
    ).toEqual({
      "todo-list": { nameHeldBy: "document model", claims: [] },
    });
  });

  it("refuses the name of a core subgraph", async () => {
    expect(
      await conflicts([
        { name: "system", typeDefs: template("System", "sys") },
      ]),
    ).toEqual({ system: { nameHeldBy: "core", claims: [] } });
  });

  it("leaves a model without operations unmounted, so its name is free", async () => {
    expect(
      await conflicts(
        [{ name: "todo-list", typeDefs: template("TodoList", "todoList") }],
        [model("TodoList", "")],
      ),
    ).toEqual({});
  });

  it("reports a type the model's own subgraph generates", async () => {
    const typeDefs = gql`
      type TodoListQueries {
        example(driveId: String!): String
      }
      type Query {
        todoTools: TodoListQueries!
      }
    `;

    expect(await conflicts([{ name: "todo-tools", typeDefs }])).toEqual({
      "todo-tools": {
        claims: [{ claim: "TodoListQueries", owner: "todo-list" }],
      },
    });
  });

  it("reports a type a base model's subgraph generates", async () => {
    const typeDefs = gql`
      type DocumentModelQueries {
        example: String
      }
    `;

    expect(await conflicts([{ name: "ledger", typeDefs }], [])).toEqual({
      ledger: {
        claims: [{ claim: "DocumentModelQueries", owner: "document-model" }],
      },
    });
  });

  it("reports a model's generated document type", async () => {
    const typeDefs = gql`
      type TodoList {
        id: ID
      }
    `;

    expect(await conflicts([{ name: "ledger", typeDefs }])).toEqual({
      ledger: { claims: [{ claim: "TodoList", owner: "todo-list" }] },
    });
  });

  it("reports a type every generated schema reserves", async () => {
    const typeDefs = gql`
      type Operation {
        id: ID
      }
    `;

    expect(await conflicts([{ name: "ledger", typeDefs }], [])).toEqual({
      ledger: {
        claims: [{ claim: "Operation", owner: DOCUMENT_MODEL_SCHEMA_OWNER }],
      },
    });
  });

  it("reports a core type and root field defined differently", async () => {
    const typeDefs = gql`
      type Revision {
        id: ID
      }
      type Query {
        system: String
      }
    `;

    expect(await conflicts([{ name: "ledger", typeDefs }], [])).toEqual({
      ledger: {
        claims: [
          { claim: "Query.system", owner: "system" },
          { claim: "Revision", owner: "r" },
        ],
      },
    });
  });

  it("gives a root field two package subgraphs define to the first", async () => {
    const typeDefs = gql`
      type Query {
        ledger: String
      }
    `;

    expect(
      await conflicts([
        { name: "ledger", typeDefs },
        { name: "ledger-copy", typeDefs },
      ]),
    ).toEqual({
      "ledger-copy": { claims: [{ claim: "Query.ledger", owner: "ledger" }] },
    });
  });

  it("reports a model whose schema does not parse and checks the rest", async () => {
    const report = await findPackageSubgraphConflicts(
      [{ name: "todo-list", typeDefs: template("TodoList", "todoList") }],
      [todoList, model("Broken", "input BrokenInput {")],
    );

    expect(report.refusedModels.map(({ name }) => name)).toEqual(["Broken"]);
    expect(Object.fromEntries(report.conflicts)).toEqual({
      "todo-list": { nameHeldBy: "document model", claims: [] },
    });
  });
});

describe("findPackageSubgraphConflicts runtime parity", () => {
  it("refuses a model that generates a reserved type name, freeing its subgraph name", async () => {
    const report = await findPackageSubgraphConflicts(
      [{ name: "revision", typeDefs: template("Revision", "revision") }],
      [model("Revision"), model("Operation")],
    );

    expect(Object.fromEntries(report.conflicts)).toEqual({});
    expect(report.refusedModels).toEqual([
      {
        name: "Revision",
        subgraphOnly: false,
        reason: "generates reserved type names: Revision",
      },
      {
        name: "Operation",
        subgraphOnly: false,
        reason: "generates reserved type names: Operation",
      },
    ]);
  });

  it("refuses a model whose generated types do not build", async () => {
    const report = await findPackageSubgraphConflicts(
      [{ name: "dangling", typeDefs: template("Dangling", "dangling") }],
      [model("Dangling", undefined, "type DanglingState { owner: Missing }")],
    );

    expect(Object.fromEntries(report.conflicts)).toEqual({});
    expect(report.refusedModels).toEqual([
      {
        name: "Dangling",
        subgraphOnly: false,
        reason: expect.stringContaining("has an unusable schema"),
      },
    ]);
  });

  it("keeps the generated types of a model whose own subgraph does not build", async () => {
    const report = await findPackageSubgraphConflicts(
      [
        { name: "widget", typeDefs: template("Widget", "widget") },
        {
          name: "ledger",
          typeDefs: gql`
            type Widget {
              id: ID
            }
          `,
        },
        {
          name: "notes",
          typeDefs: gql`
            type Broken {
              id: ID
            }
          `,
        },
      ],
      [
        model("Widget", "input SetWidgetTitleInput { owner: Missing }"),
        model("Broken", "input BrokenInput {"),
      ],
    );

    expect(Object.fromEntries(report.conflicts)).toEqual({
      ledger: { claims: [{ claim: "Widget", owner: "widget" }] },
      notes: { claims: [{ claim: "Broken", owner: "broken" }] },
    });
    expect(report.refusedModels).toEqual([
      {
        name: "Widget",
        subgraphOnly: true,
        reason: expect.stringContaining("has an unusable subgraph schema"),
      },
      {
        name: "Broken",
        subgraphOnly: true,
        reason: expect.stringContaining("has an unusable subgraph schema"),
      },
    ]);
  });

  it("leaves out a model's subgraph named like a core subgraph", async () => {
    const report = await findPackageSubgraphConflicts(
      [
        {
          name: "ledger",
          typeDefs: gql`
            type SystemQueries {
              ledger: String
            }
          `,
        },
      ],
      [model("System")],
    );

    expect(Object.fromEntries(report.conflicts)).toEqual({});
    expect(report.refusedModels).toEqual([
      {
        name: "System",
        subgraphOnly: true,
        reason: "its subgraph name is taken by a subgraph from core",
      },
    ]);
  });

  it("serves only the last of two package subgraphs with one name", async () => {
    const typeDefs = gql`
      type Query {
        ledger: String
      }
    `;

    expect(
      await conflicts([
        { name: "ledger", typeDefs },
        { name: "ledger", typeDefs },
      ]),
    ).toEqual({ ledger: { nameHeldBy: "package", claims: [] } });
  });
});
