import assert from "node:assert/strict";
import { upgradeDocumentAction } from "@powerhousedao/reactor";
import { CodeFirstTodoV1 } from "../dist/node/document-models/index.mjs";

const baseUrl = (
  process.env.SWITCHBOARD_URL ?? "http://localhost:4101"
).replace(/\/$/, "");

async function graphql(path, query, variables = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const body = await response.json();
  if (!response.ok || body.errors?.length) {
    throw new Error(
      `GraphQL request failed at ${path}: ${JSON.stringify(body.errors ?? body)}`,
    );
  }
  return body.data;
}

async function waitForSwitchboard() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      await graphql("/graphql", "{ __typename }");
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error(`Switchboard did not become ready at ${baseUrl}`);
}

await waitForSwitchboard();

const statuses = await graphql(
  "/graphql",
  `
    query MixedSubgraphStatus {
      codeFirstStatus {
        status
        timestamp
      }
      legacyStatus {
        example(driveId: "smoke")
      }
    }
  `,
);
assert.equal(statuses.codeFirstStatus.status, "code-first-ok");
assert.ok(!Number.isNaN(Date.parse(statuses.codeFirstStatus.timestamp)));
assert.deepEqual(statuses.legacyStatus, { example: "example" });

const legacyCreated = await graphql(
  "/graphql/legacy-todo",
  `
    mutation CreateLegacy($name: String!) {
      LegacyTodo {
        createDocument(name: $name) {
          id
          documentType
          state {
            document {
              version
            }
            global {
              todos {
                id
                title
                completed
              }
            }
          }
        }
      }
    }
  `,
  { name: "Switchboard legacy smoke" },
);
const legacyId = legacyCreated.LegacyTodo.createDocument.id;
assert.equal(
  legacyCreated.LegacyTodo.createDocument.documentType,
  "test/legacy-todo",
);

const legacyMutated = await graphql(
  "/graphql/legacy-todo",
  `
    mutation AddLegacy($id: PHID!, $input: LegacyTodo_AddLegacyTodoInput!) {
      LegacyTodo {
        addLegacyTodo(docId: $id, input: $input) {
          state {
            document {
              version
            }
            global {
              todos {
                id
                title
                completed
              }
            }
          }
        }
      }
    }
  `,
  {
    id: legacyId,
    input: {
      id: "legacy-switchboard-1",
      title: "Legacy mutation through Switchboard",
      completed: false,
    },
  },
);
assert.equal(
  legacyMutated.LegacyTodo.addLegacyTodo.state.global.todos[0].title,
  "Legacy mutation through Switchboard",
);

const codeFirstCreated = await graphql(
  "/graphql/code-first-todo",
  `
    mutation CreateCodeFirst($name: String!) {
      CodeFirstTodo {
        createDocument(name: $name) {
          id
          documentType
          state {
            document {
              version
            }
            global {
              listName
              todos {
                id
                title
                completed
              }
            }
          }
        }
      }
    }
  `,
  { name: "Switchboard code-first smoke" },
);
const codeFirstId = codeFirstCreated.CodeFirstTodo.createDocument.id;
assert.equal(
  codeFirstCreated.CodeFirstTodo.createDocument.state.document.version,
  2,
);

await graphql(
  "/graphql/code-first-todo",
  `
    mutation AddCodeFirst(
      $id: PHID!
      $input: CodeFirstTodo_AddCodeFirstTodoInput!
    ) {
      CodeFirstTodo {
        addCodeFirstTodo(docId: $id, input: $input) {
          id
        }
      }
    }
  `,
  {
    id: codeFirstId,
    input: {
      id: "code-first-switchboard-1",
      title: "Code-first mutation through Switchboard",
    },
  },
);

const codeFirstRenamed = await graphql(
  "/graphql/code-first-todo",
  `
    mutation RenameCodeFirst(
      $id: PHID!
      $input: CodeFirstTodo_RenameCodeFirstListInput!
    ) {
      CodeFirstTodo {
        renameCodeFirstList(docId: $id, input: $input) {
          state {
            document {
              version
            }
            global {
              listName
              todos {
                id
                title
                completed
              }
            }
          }
        }
      }
    }
  `,
  { id: codeFirstId, input: { name: "Renamed by Switchboard" } },
);
assert.deepEqual(
  codeFirstRenamed.CodeFirstTodo.renameCodeFirstList.state.global,
  {
    listName: "Renamed by Switchboard",
    todos: [
      {
        id: "code-first-switchboard-1",
        title: "Code-first mutation through Switchboard",
        completed: false,
      },
    ],
  },
);

const supergraphDocuments = await graphql(
  "/graphql",
  `
    query ReadMixedDocuments($legacyId: String!, $codeFirstId: String!) {
      LegacyTodo {
        document(identifier: $legacyId) {
          document {
            id
            state {
              global {
                todos {
                  id
                  title
                  completed
                }
              }
            }
          }
        }
      }
      CodeFirstTodo {
        document(identifier: $codeFirstId) {
          document {
            id
            state {
              global {
                listName
                todos {
                  id
                  title
                  completed
                }
              }
            }
          }
        }
      }
    }
  `,
  { legacyId, codeFirstId },
);
assert.equal(supergraphDocuments.LegacyTodo.document.document.id, legacyId);
assert.equal(
  supergraphDocuments.CodeFirstTodo.document.document.id,
  codeFirstId,
);

const v1Document = CodeFirstTodoV1.utils.createDocument();
v1Document.header.name = "Switchboard V1 upgrade smoke";
const v1Created = await graphql(
  "/graphql/r",
  `
    mutation CreateV1($document: JSONObject!) {
      createDocument(document: $document) {
        id
        state
        revisionsList {
          scope
          revision
        }
      }
    }
  `,
  { document: v1Document },
);
assert.equal(v1Created.createDocument.state.document.version, 1);

const v1WithTodo = await graphql(
  "/graphql/r",
  `
    mutation ExecuteV1($id: String!, $actions: [ActionInput!]!) {
      execute(documentIdentifier: $id, branch: "main", actions: $actions) {
        id
        state
        revisionsList {
          scope
          revision
        }
      }
    }
  `,
  {
    id: v1Created.createDocument.id,
    actions: [
      CodeFirstTodoV1.actions.addCodeFirstTodo({
        id: "before-switchboard-upgrade",
        title: "Survives the Switchboard upgrade",
      }),
    ],
  },
);
assert.equal(v1WithTodo.execute.state.document.version, 1);

const revision = Object.fromEntries(
  v1WithTodo.execute.revisionsList.map(({ scope, revision: value }) => [
    scope,
    value,
  ]),
);
const upgraded = await graphql(
  "/graphql/r",
  `
    mutation UpgradeV1($id: String!, $actions: [ActionInput!]!) {
      execute(documentIdentifier: $id, branch: "main", actions: $actions) {
        id
        state
      }
    }
  `,
  {
    id: v1WithTodo.execute.id,
    actions: [
      upgradeDocumentAction({
        documentId: v1WithTodo.execute.id,
        model: "test/code-first-todo",
        fromVersion: 1,
        toVersion: 2,
        revision,
      }),
    ],
  },
);
assert.equal(upgraded.execute.state.document.version, 2);
assert.equal(
  upgraded.execute.state.global.listName,
  "Migrated code-first todos",
);
assert.equal(
  upgraded.execute.state.global.todos[0].title,
  "Survives the Switchboard upgrade",
);

process.stdout.write(
  `${JSON.stringify(
    {
      ok: true,
      host: baseUrl,
      subgraphs: ["legacy-status", "code-first-status"],
      documents: {
        legacy: { id: legacyId, version: 1 },
        codeFirst: { id: codeFirstId, version: 2 },
        upgraded: { id: upgraded.execute.id, fromVersion: 1, toVersion: 2 },
      },
    },
    null,
    2,
  )}\n`,
);
