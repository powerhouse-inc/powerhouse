import type {
  DocumentModelDefinition,
  DocumentModelModule,
} from "@powerhousedao/shared/document-model";
import {
  checkDocumentModelDefinitionShape,
  DefinitionDiagnosticCollector,
} from "document-model";
import { type DocumentNode, Kind, parse, print } from "graphql";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { structuredModelOf } from "../src/graphql/structured-projection.js";
import { isDocumentModelModule } from "../src/packages/document-model-detection.js";
import {
  createSchema,
  generateDocumentModelSchema,
} from "../src/utils/create-schema.js";
import {
  asSchemaFirst,
  hostFor,
  messages,
  printSchema,
} from "./utils/graphql-host.js";

const MODEL_NAMES = [
  { root: "processor-module", name: "ProcessorModule" },
  { root: "document-editor", name: "DocumentEditor" },
  { root: "app-module", name: "AppModule" },
  { root: "vetra-package", name: "VetraPackage" },
] as const;

const MODELS = await Promise.all(
  MODEL_NAMES.map(async (model) => {
    const namespace: Record<string, unknown> = await import(
      `../../vetra/document-models/${model.root}/v1/module.ts`
    );
    const module = namespace[model.name];
    if (!isDocumentModelModule(module)) {
      throw new Error(`Missing shipped module ${model.name}`);
    }
    return { ...model, module };
  }),
);

type Model = (typeof MODELS)[number];
type LifecycleModel = Extract<
  Model,
  { readonly name: "ProcessorModule" | "DocumentEditor" }
>;
type MutationMode = "sync" | "async";
type Operation = "addDocumentType" | "removeDocumentType";

function withGoldenDefinition(
  module: DocumentModelModule,
  root: Model["root"],
): DocumentModelModule & { readonly definition: DocumentModelDefinition } {
  const definition: unknown = JSON.parse(
    readFileSync(
      new URL(
        `../../document-model/test/parity/goldens/${root}.definition.json`,
        import.meta.url,
      ),
      "utf8",
    ),
  );
  if (
    !checkDocumentModelDefinitionShape(
      new DefinitionDiagnosticCollector(),
      definition,
    )
  ) {
    throw new Error(`Invalid golden definition for ${root}`);
  }
  return { ...module, definition };
}

function modelType(document: DocumentNode, name: string) {
  const definition = document.definitions.find(
    (node) =>
      (node.kind === Kind.OBJECT_TYPE_DEFINITION ||
        node.kind === Kind.INPUT_OBJECT_TYPE_DEFINITION) &&
      node.name.value === name,
  );
  if (
    definition?.kind !== Kind.OBJECT_TYPE_DEFINITION &&
    definition?.kind !== Kind.INPUT_OBJECT_TYPE_DEFINITION
  ) {
    throw new Error(`Missing object or input type ${name}`);
  }
  return definition;
}

function mutationSource(
  name: LifecycleModel["name"],
  operation: Operation,
  mode: MutationMode,
): string {
  const inputType =
    operation === "addDocumentType"
      ? "AddDocumentTypeInput"
      : "RemoveDocumentTypeInput";
  const field = `${operation}${mode === "async" ? "Async" : ""}`;
  const selection =
    mode === "async"
      ? ""
      : "{ state { global { documentTypes { id documentType } } } }";
  return `mutation ($input: ${name}_${inputType}!) {
    ${name} { ${field}(docId: "doc-1", input: $input) ${selection} }
  }`;
}

function documentTypesQuery(name: LifecycleModel["name"]): string {
  return `query {
    ${name} {
      document(idOrSlug: "doc-1") {
        document { state { global { documentTypes { id documentType } } } }
      }
    }
  }`;
}

describe.each(MODELS)(
  "$name stored-SDL regression",
  ({ root, name, module }) => {
    it.each([false, true])(
      "preserves the canonical schema and descriptions with useNewApi: %s",
      (useNewApi) => {
        const stored = asSchemaFirst(module);
        const structured = withGoldenDefinition(module, root);
        expect(structuredModelOf(stored)).toBeNull();
        expect(structuredModelOf(structured)).not.toBeNull();
        const storedSchema = printSchema(
          createSchema(
            [stored],
            {},
            generateDocumentModelSchema(stored, { useNewApi }),
          ),
        );
        const structuredSchema = printSchema(
          createSchema(
            [structured],
            {},
            generateDocumentModelSchema(structured, { useNewApi }),
          ),
        );
        expect(structuredSchema).toBe(storedSchema);

        for (const schema of [storedSchema, structuredSchema]) {
          const document = parse(schema);
          if (name === "ProcessorModule" || name === "DocumentEditor") {
            for (const type of [
              "DocumentTypeItem",
              "AddDocumentTypeInput",
              "RemoveDocumentTypeInput",
            ]) {
              const fields =
                modelType(document, `${name}_${type}`).fields ?? [];
              expect(fields.map((field) => field.name.value)).toEqual(
                type === "RemoveDocumentTypeInput"
                  ? ["id"]
                  : ["documentType", "id"],
              );
              const id = fields.find((field) => field.name.value === "id");
              expect(id === undefined ? undefined : print(id.type)).toBe(
                "OID!",
              );
            }
            expect(
              modelType(document, `${name}_DocumentTypeItem`).description
                ?.value,
            ).toBe(
              name === "ProcessorModule"
                ? "A document type id (e.g. 'my-org/invoice') attached to the processor with a stable entry id."
                : "A document type id (e.g. 'powerhouse/document-drive') attached to the editor with a stable entry id.",
            );
          }
          if (name === "DocumentEditor") {
            expect(
              modelType(document, "DocumentEditor_DocumentEditorState")
                .description?.value,
            ).toBe(
              "Configuration for a document editor contributed by the package. The editor is\nregistered against every document type listed in `documentTypes`; Connect picks\nthe first matching editor when opening a document.",
            );
          }
          if (name === "AppModule") {
            expect(
              modelType(document, "AppModule_AppModuleState").fields?.find(
                (field) => field.name.value === "allowedDocumentTypes",
              )?.description?.value,
            ).toBe(
              "Document type ids this app handles. `null` means the app accepts any document type; an empty list means it accepts none.",
            );
          }
          if (name === "VetraPackage") {
            const author = modelType(document, "VetraPackage_Author");
            expect(author.description?.value).toBe(
              "Author/maintainer of the Vetra Package.",
            );
            expect(
              author.fields?.find((field) => field.name.value === "website")
                ?.description?.value,
            ).toBe("Author's website URL.");
            expect(
              modelType(
                document,
                "VetraPackage_VetraPackageState",
              ).fields?.find((field) => field.name.value === "author")
                ?.description?.value,
            ).toBe(
              "Author/maintainer information surfaced in the published package metadata.",
            );
          }
        }
      },
    );
  },
);

const LIFECYCLE_MODELS = MODELS.filter(
  (model): model is LifecycleModel =>
    model.name === "ProcessorModule" || model.name === "DocumentEditor",
);

describe.each(LIFECYCLE_MODELS)(
  "$name GraphQL lifecycle",
  ({ root, name, module }) => {
    describe.each(["schema-first", "code-first"] as const)(
      "%s",
      (projection) => {
        const runtimeModule =
          projection === "schema-first"
            ? asSchemaFirst(module)
            : withGoldenDefinition(module, root);

        describe.each(["sync", "async"] as const)("%s resolver", (mode) => {
          it("adds, reads and removes canonical ids, including unknown-id no-ops", async () => {
            const host = hostFor(runtimeModule);
            expect(structuredModelOf(runtimeModule) !== null).toBe(
              projection === "code-first",
            );
            const added = await host.run(
              mutationSource(name, "addDocumentType", mode),
              {
                input: { id: "invoice-1", documentType: "test/invoice" },
              },
            );
            expect(added).toEqual({
              data: {
                [name]: {
                  [`addDocumentType${mode === "async" ? "Async" : ""}`]:
                    mode === "async"
                      ? "job-1"
                      : {
                          state: {
                            global: {
                              documentTypes: [
                                {
                                  id: "invoice-1",
                                  documentType: "test/invoice",
                                },
                              ],
                            },
                          },
                        },
                },
              },
            });
            expect(host.state().documentTypes).toEqual([
              { id: "invoice-1", documentType: "test/invoice" },
            ]);
            expect(await host.run(documentTypesQuery(name))).toEqual({
              data: {
                [name]: {
                  document: {
                    document: {
                      state: {
                        global: {
                          documentTypes: [
                            { id: "invoice-1", documentType: "test/invoice" },
                          ],
                        },
                      },
                    },
                  },
                },
              },
            });

            const beforeUnknown = structuredClone(host.state());
            const unknown = await host.run(
              mutationSource(name, "removeDocumentType", mode),
              {
                input: { id: "unknown-id" },
              },
            );
            expect(messages(unknown)).toEqual([]);
            expect(unknown.data).toEqual({
              [name]: {
                [`removeDocumentType${mode === "async" ? "Async" : ""}`]:
                  mode === "async"
                    ? "job-1"
                    : {
                        state: {
                          global: {
                            documentTypes: [
                              { id: "invoice-1", documentType: "test/invoice" },
                            ],
                          },
                        },
                      },
              },
            });
            expect(host.state()).toEqual(beforeUnknown);
            const removed = await host.run(
              mutationSource(name, "removeDocumentType", mode),
              {
                input: { id: "invoice-1" },
              },
            );
            expect(removed).toEqual({
              data: {
                [name]: {
                  [`removeDocumentType${mode === "async" ? "Async" : ""}`]:
                    mode === "async"
                      ? "job-1"
                      : { state: { global: { documentTypes: [] } } },
                },
              },
            });
            expect(host.state().documentTypes).toEqual([]);
            expect(await host.run(documentTypesQuery(name))).toEqual({
              data: {
                [name]: {
                  document: {
                    document: {
                      state: { global: { documentTypes: [] } },
                    },
                  },
                },
              },
            });
          });

          it("reports reducer errors in the inline test client and permits recovery", async () => {
            const host = hostFor(runtimeModule);
            const source = mutationSource(name, "addDocumentType", mode);
            expect(
              messages(
                await host.run(source, {
                  input: { id: "invoice-1", documentType: "test/invoice" },
                }),
              ),
            ).toEqual([]);
            const before = structuredClone(host.state());
            const duplicate = await host.run(source, {
              input: { id: "invoice-1", documentType: "test/changed" },
            });
            expect(messages(duplicate)).toEqual([
              'Document type with id "invoice-1" already exists',
            ]);
            expect(duplicate.data).toBeNull();
            expect(host.state()).toEqual(before);
            expect(
              messages(
                await host.run(source, {
                  input: { id: "receipt-2", documentType: "test/receipt" },
                }),
              ),
            ).toEqual([]);
            expect(host.state().documentTypes).toEqual([
              { id: "invoice-1", documentType: "test/invoice" },
              { id: "receipt-2", documentType: "test/receipt" },
            ]);
            expect(
              messages(
                await host.run(
                  mutationSource(name, "removeDocumentType", mode),
                  {
                    input: { id: "invoice-1" },
                  },
                ),
              ),
            ).toEqual([]);
            expect(await host.run(documentTypesQuery(name))).toEqual({
              data: {
                [name]: {
                  document: {
                    document: {
                      state: {
                        global: {
                          documentTypes: [
                            { id: "receipt-2", documentType: "test/receipt" },
                          ],
                        },
                      },
                    },
                  },
                },
              },
            });
            expect(host.state().documentTypes).toEqual([
              { id: "receipt-2", documentType: "test/receipt" },
            ]);
          });

          it.each(["addDocumentType", "removeDocumentType"] as const)(
            "%s rejects missing/null ids and accidental aliases without changing state",
            async (operation) => {
              const host = hostFor(runtimeModule);
              expect(
                messages(
                  await host.run(
                    mutationSource(name, "addDocumentType", mode),
                    {
                      input: { id: "invoice-1", documentType: "test/invoice" },
                    },
                  ),
                ),
              ).toEqual([]);
              const before = structuredClone(host.state());
              const extra =
                operation === "addDocumentType"
                  ? { documentType: "test/changed" }
                  : {};
              const source = mutationSource(name, operation, mode);
              const missing = await host.run(source, { input: extra });
              expect(messages(missing)).toEqual([
                expect.stringContaining(
                  'Field "id" of required type "OID!" was not provided',
                ),
              ]);
              expect(missing.data).toBeUndefined();
              expect(host.state()).toEqual(before);
              const nullId = await host.run(source, {
                input: { ...extra, id: null },
              });
              expect(messages(nullId)).toEqual([
                expect.stringContaining(
                  'Expected non-nullable type "OID!" not to be null',
                ),
              ]);
              expect(nullId.data).toBeUndefined();
              expect(host.state()).toEqual(before);
              const alias = await host.run(source, {
                input: { ...extra, [`${name}_id`]: "invoice-1" },
              });
              expect(messages(alias)).toHaveLength(2);
              expect(messages(alias)).toEqual(
                expect.arrayContaining([
                  expect.stringContaining(
                    'Field "id" of required type "OID!" was not provided',
                  ),
                  expect.stringContaining(`Field "${name}_id" is not defined`),
                ]),
              );
              expect(alias.data).toBeUndefined();
              expect(host.state()).toEqual(before);
              expect(host.state().documentTypes).toEqual([
                { id: "invoice-1", documentType: "test/invoice" },
              ]);
            },
          );
        });
      },
    );
  },
);
