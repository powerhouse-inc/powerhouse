import type { IReactorClient } from "@powerhousedao/reactor";
import type { DocumentModelGlobalState } from "@powerhousedao/shared/document-model";
import { parse, print } from "graphql";
import { gql } from "graphql-tag";
import { describe, expect, it } from "vitest";
import { coreSubgraphClasses } from "../src/config.js";
import type { IReactorInspectionSource } from "../src/graphql/inspection/source.js";
import {
  forgetReportedScalarBindings,
  unreportedScalarBindings,
} from "../src/graphql/scalar-bindings.js";
import {
  coreSubgraphTypeDefs,
  describeRefusedDocumentModel,
  describeSubgraphConflict,
  DOCUMENT_MODEL_SCHEMA_OWNER,
  findPackageSubgraphConflicts,
  hostDocumentModels,
  type PackageSubgraph,
} from "../src/graphql/subgraph-types.js";
import type { SubgraphArgs } from "../src/graphql/types.js";
import { servedSubgraph } from "./utils/served-subgraph.js";

function model(
  name: string,
  operationSchema = `input Set${name}TitleInput { title: String }`,
  stateSchema = `type ${name}State { title: String }`,
): DocumentModelGlobalState {
  const constant = name.replace(/([a-z])([A-Z])/g, "$1_$2").toUpperCase();
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
                  { name: `SET_${constant}_TITLE`, schema: operationSchema },
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

function version(
  global: DocumentModelGlobalState,
  number: number,
): DocumentModelGlobalState {
  return {
    ...global,
    specifications: global.specifications.map((specification) => ({
      ...specification,
      version: number,
    })),
  };
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
    Array.from(
      findPackageSubgraphConflicts(subgraphs, hostDocumentModels(models))
        .conflicts,
      ([subgraph, conflict]) => [subgraph.name, conflict],
    ),
  );
}

function contests(
  subgraphs: PackageSubgraph[],
  models: DocumentModelGlobalState[] = [],
) {
  return findPackageSubgraphConflicts(
    subgraphs,
    hostDocumentModels(models),
  ).contests.map(({ claim, claimants, groups }) => ({
    claim,
    claimants: claimants.map(({ name }) => name),
    groups,
  }));
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
    }).map((Subgraph) => servedSubgraph(new Subgraph(args)));

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
        kind: "owned",
        claims: [{ claim: "TodoListQueries", owner: "todo-list" }],
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
        kind: "owned",
        claims: [{ claim: "DocumentModelQueries", owner: "document-model" }],
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
        claims: [{ claim: "TodoList", owner: "TodoList" }],
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
        kind: "owned",
        claims: [
          { claim: "Query.system", owner: "system" },
          { claim: "Revision", owner: "r" },
        ],
      },
    });
  });

  it("reports every package subgraph that declares a contested root field", () => {
    const typeDefs = gql`
      type Query {
        ledger: String
      }
    `;
    const subgraphs = [
      { name: "ledger", typeDefs },
      { name: "ledger-copy", typeDefs },
    ];

    expect(conflicts(subgraphs)).toEqual({});
    expect(contests(subgraphs)).toEqual([
      {
        claim: "Query.ledger",
        claimants: ["ledger", "ledger-copy"],
        groups: [["ledger", "ledger-copy"]],
      },
    ]);
  });

  it("finds every contest in a chain, whatever order the subgraphs come in", () => {
    const alpha = {
      name: "alpha",
      typeDefs: gql`
        type Query {
          x: String
        }
      `,
    };
    const beta = {
      name: "beta",
      typeDefs: gql`
        type Query {
          x: String
          y: String
        }
      `,
    };
    const gamma = {
      name: "gamma",
      typeDefs: gql`
        type Query {
          y: String
        }
      `,
    };
    const expected = [
      {
        claim: "Query.x",
        claimants: ["alpha", "beta"],
        groups: [["alpha", "beta"]],
      },
      {
        claim: "Query.y",
        claimants: ["beta", "gamma"],
        groups: [["beta", "gamma"]],
      },
    ];

    expect(contests([alpha, beta, gamma])).toEqual(expected);
    expect(contests([gamma, beta, alpha])).toEqual(expected);
  });

  it("lets package subgraphs share a type they define identically", () => {
    const shared = "type Gadget { id: ID! size: Int }";
    expect(
      conflicts(
        [
          {
            name: "alpha",
            typeDefs: parse(`type Query { a: Gadget } ${shared}`),
          },
          {
            name: "beta",
            typeDefs: parse(`type Query { b: Gadget } ${shared}`),
          },
        ],
        [],
      ),
    ).toEqual({});
  });

  it("checks each of two subgraphs with one name on its own claims", () => {
    const first = {
      name: "ledger",
      typeDefs: gql`
        type Query {
          x: String
        }
      `,
    };
    const second = {
      name: "ledger",
      typeDefs: gql`
        type Query {
          y: String
        }
      `,
    };
    const other = {
      name: "other",
      typeDefs: gql`
        type Query {
          x: String
        }
      `,
    };

    const report = findPackageSubgraphConflicts(
      [first, second, other],
      hostDocumentModels([]),
    );

    expect(report.duplicateNames).toEqual(["ledger"]);
    expect(report.conflicts.size).toBe(0);
    expect(report.contests).toEqual([
      {
        claim: "Query.x",
        claimants: [first, other],
        groups: [["ledger", "other"]],
      },
    ]);
  });

  it("contests a type only between subgraphs that define it differently", () => {
    const gadget = (field: string, body: string) =>
      parse(`type Query { ${field}: Gadget } type Gadget { ${body} }`);
    const subgraphs = [
      { name: "gamma", typeDefs: gadget("c", "id: ID! size: Int") },
      { name: "beta", typeDefs: gadget("b", "id: ID!") },
      { name: "alpha", typeDefs: gadget("a", "id: ID!") },
    ];

    expect(conflicts(subgraphs, [])).toEqual({});
    expect(contests(subgraphs)).toEqual([
      {
        claim: "Gadget",
        claimants: ["alpha", "beta", "gamma"],
        groups: [["alpha", "beta"], ["gamma"]],
      },
    ]);
  });
});

describe("hostDocumentModels", () => {
  it("refuses a model whose state schema does not build, and checks the rest", () => {
    const host = hostDocumentModels([
      todoList,
      model("Broken", "", "type BrokenState {"),
    ]);

    expect(host.refused).toEqual([
      {
        id: "test/Broken",
        name: "Broken",
        kind: "unusable schema",
        reason: expect.stringMatching(/^has an unusable schema: /),
      },
    ]);
    expect(
      Object.fromEntries(
        Array.from(
          findPackageSubgraphConflicts(
            [{ name: "todo-list", typeDefs: template("TodoList", "todoList") }],
            host,
          ).conflicts,
          ([subgraph, conflict]) => [subgraph.name, conflict],
        ),
      ),
    ).toEqual({
      "todo-list": { kind: "name", heldBy: "document model" },
    });
  });

  it("refuses a model that generates a core type name, as the server does", () => {
    const systemInfo = model("SystemInfo");

    expect(hostDocumentModels([systemInfo]).refused).toEqual([
      {
        id: "test/SystemInfo",
        name: "SystemInfo",
        kind: "reserved names",
        reason: "generates reserved type names: SystemInfo",
      },
    ]);
    expect(
      conflicts(
        [
          {
            name: "system-info",
            typeDefs: gql`
              type SystemInfo_SystemInfoState {
                title: String
              }
              type Query {
                systemInfoTitle: SystemInfo_SystemInfoState
              }
            `,
          },
        ],
        [systemInfo],
      ),
    ).toEqual({});
  });

  it("frees the name of a model whose own subgraph does not build", () => {
    const notes = model("Notes", "input SetNotesTitleInput { title: Missing }");

    expect(hostDocumentModels([notes]).refused).toEqual([
      {
        id: "test/Notes",
        name: "Notes",
        kind: "unusable subgraph",
        reason: expect.stringMatching(/^has an unusable subgraph schema: /),
      },
    ]);
    expect(
      conflicts(
        [{ name: "notes", typeDefs: template("Notes", "notes") }],
        [notes],
      ),
    ).toEqual({});
  });

  it("takes each model's subgraph from its latest version, as the server does", () => {
    const v1 = version(model("Notes"), 1);
    const v2 = version(
      model("Notes", "input SetNotesTitleInput { title: Missing }"),
      2,
    );
    const notes = { name: "notes", typeDefs: template("Notes", "notes") };

    for (const models of [
      [v1, v2],
      [v2, v1],
    ]) {
      const host = hostDocumentModels(models);
      expect(host.subgraphs.map(({ name }) => name)).not.toContain("notes");
      expect(findPackageSubgraphConflicts([notes], host).conflicts.size).toBe(
        0,
      );
    }
  });

  it("refuses every version of a model whose latest version is refused, as the server does", () => {
    const v1 = version(model("Notes"), 1);
    const v2 = version(model("Notes", "", "type NotesState {"), 2);

    for (const models of [
      [v1, v2],
      [v2, v1],
    ]) {
      const host = hostDocumentModels(models);
      expect(host.admitted).not.toContain(v1);
      expect(host.subgraphs.map(({ name }) => name)).not.toContain("notes");
      expect(host.refused).toEqual([
        {
          id: "test/Notes",
          name: "Notes",
          kind: "unusable schema",
          reason: expect.stringMatching(/^has an unusable schema: /),
        },
      ]);
    }
  });

  it("refuses a model subgraph whose name a core subgraph holds, as the server does", () => {
    const host = hostDocumentModels([model("R")]);

    expect(host.subgraphs.map(({ name }) => name)).not.toContain("r");
    expect(host.refused).toEqual([
      {
        id: "test/R",
        name: "R",
        kind: "reserved subgraph name",
        reason: 'has a subgraph named "r", which a core subgraph holds',
      },
    ]);
  });

  it("keeps the name, but not the claims, of a latest model subgraph that does not build onto the combined schema", () => {
    const v1 = version(
      model(
        "Notes",
        "",
        "type NotesState { title: String } type SetNotesTitleInput { title: String }",
      ),
      1,
    );
    const v2 = version(model("Notes"), 2);
    const host = hostDocumentModels([v1, v2]);

    expect(host.subgraphs.find(({ name }) => name === "notes")?.builds).toBe(
      false,
    );
    expect(host.refused).toEqual([
      {
        id: "test/Notes",
        name: "Notes",
        kind: "unservable subgraph",
        reason: expect.stringMatching(
          /^does not build onto the generated schema: /,
        ),
      },
    ]);
    expect(
      Object.fromEntries(
        Array.from(
          findPackageSubgraphConflicts(
            [
              { name: "notes", typeDefs: template("Notes", "notes") },
              {
                name: "other",
                typeDefs: gql`
                  type Query {
                    Notes: String
                  }
                `,
              },
            ],
            host,
          ).conflicts,
          ([subgraph, conflict]) => [subgraph.name, conflict],
        ),
      ),
    ).toEqual({ notes: { kind: "name", heldBy: "document model" } });
  });

  it("names the other model whose generated types an unservable subgraph clashes with", () => {
    const first = model(
      "NotesApp",
      "",
      "type NotesAppState { title: String } type SetNotesAppTitleInput { title: String }",
    );
    const second = {
      ...model("NotesApp"),
      id: "other/notes",
      name: "Notes App",
    } as DocumentModelGlobalState;
    const [refused] = hostDocumentModels([first, second]).refused;

    expect(refused).toEqual({
      id: "other/notes",
      name: "Notes App",
      kind: "unservable subgraph",
      reason: expect.stringMatching(
        /^does not build onto the generated schema: /,
      ),
      supplier: { id: "test/NotesApp", name: "NotesApp" },
    });
    expect(describeRefusedDocumentModel(refused!).repair).toBe(
      'Document model "NotesApp" is listed first under the same schema name and supplies the generated types, so rename one of the two models.',
    );
  });

  it("tells two models with one name apart by id when one supplies the clashing types", () => {
    const first = model(
      "Notes",
      "",
      "type NotesState { title: String } type SetNotesTitleInput { title: String }",
    );
    const second = {
      ...version(model("Notes"), 2),
      id: "other/notes",
    } as DocumentModelGlobalState;
    const [refused] = hostDocumentModels([first, second]).refused;

    expect(refused?.supplier).toEqual({ id: "test/Notes", name: "Notes" });
    expect(describeRefusedDocumentModel(refused!).repair).toBe(
      'Document model "Notes" (test/Notes) is listed first under the same schema name and supplies the generated types, so rename one of the two models.',
    );
  });

  it("names no supplier when the clashing types come from another version of the same model", () => {
    const v1 = version(
      model(
        "Notes",
        "",
        "type NotesState { title: String } type SetNotesTitleInput { title: String }",
      ),
      1,
    );
    const [refused] = hostDocumentModels([
      v1,
      version(model("Notes"), 2),
    ]).refused;

    expect(refused?.supplier).toBeUndefined();
  });

  it("reports a model once when the server refuses it once", () => {
    const broken = () => model("Broken", "", "type BrokenState {");

    expect(
      hostDocumentModels([broken(), broken()]).refused.map(({ name }) => name),
    ).toEqual(["Broken"]);
  });
});

describe("building a package subgraph for the check", () => {
  it("leaves the server's one-time scalar report for the server", () => {
    forgetReportedScalarBindings();
    const typeDefs = parse("scalar Money type Query { price: Money }");

    findPackageSubgraphConflicts(
      [{ name: "pay", typeDefs }],
      hostDocumentModels([]),
    );

    expect(
      unreportedScalarBindings(typeDefs, {}, new Set()).map(({ code }) => code),
    ).toEqual(["PH-SCALAR-UNREGISTERED"]);
  });
});

describe("describeRefusedDocumentModel", () => {
  it("says the server refuses a subgraph whose name a core subgraph holds", () => {
    expect(
      describeRefusedDocumentModel({
        id: "test/R",
        name: "R",
        kind: "reserved subgraph name",
        reason: 'has a subgraph named "r", which a core subgraph holds',
      }),
    ).toEqual({
      code: "PH-DM-GRAPHQL-REFUSED",
      message:
        'The server refuses the subgraph of document model "R": it has a subgraph named "r", which a core subgraph holds.',
      repair:
        "Rename the document model, so its subgraph takes a name no core subgraph holds.",
    });
  });

  it("says the server registers but cannot serve a subgraph that does not build beside the others", () => {
    expect(
      describeRefusedDocumentModel({
        id: "test/Notes",
        name: "Notes",
        kind: "unservable subgraph",
        reason: "does not build onto the generated schema: Bad input.",
      }),
    ).toEqual({
      code: "PH-DM-GRAPHQL-REFUSED",
      message:
        'The server registers the subgraph of document model "Notes" but cannot serve it: it does not build onto the generated schema: Bad input.',
      repair:
        "Make every version of the document model define its types the same way, or retire the version that differs.",
    });
  });
});

describe("describeSubgraphConflict", () => {
  it("joins the generated types each model generates", () => {
    expect(
      describeSubgraphConflict("ledger", {
        kind: "generated",
        claims: [
          { claim: "Operation", owner: DOCUMENT_MODEL_SCHEMA_OWNER },
          { claim: "Signer", owner: DOCUMENT_MODEL_SCHEMA_OWNER },
          { claim: "Notes", owner: "Notes" },
        ],
      }).map(({ message }) => message),
    ).toEqual([
      'Subgraph "ledger" defines Operation and Signer, which the document-model schema generates, and Notes, which document model "Notes" generates, so the server refuses it.',
    ]);
  });
});

describe("a package subgraph whose schema does not build", () => {
  it("is left out of the claims, as the server leaves it out", () => {
    const broken = {
      name: "broken",
      typeDefs: parse("type Query { shared: Missing }"),
    };
    const working = {
      name: "working",
      typeDefs: parse("type Query { shared: String }"),
    };
    const report = findPackageSubgraphConflicts(
      [broken, working],
      hostDocumentModels([]),
    );

    expect(report.conflicts.get(broken)).toEqual({
      kind: "unbuildable",
      message: 'Unknown type "Missing".',
    });
    expect(report.conflicts.has(working)).toBe(false);
    expect(report.contests).toEqual([]);
  });
});
