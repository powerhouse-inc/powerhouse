import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  checkDerivedNameCollisions,
  type DerivedModuleNames,
  deriveDocumentModelErrorNames,
  deriveDocumentModelModuleNames,
  deriveDocumentModelNames,
  deriveDocumentModelOperationNames,
} from "../../src/definition/naming.js";

const repoRoot = new URL("../../../../", import.meta.url);

function read(path: string): string {
  return readFileSync(new URL(path, repoRoot), "utf8");
}

describe("deriveDocumentModelOperationNames", () => {
  const rows: readonly [
    string,
    {
      storedName: string;
      actionType: string;
      inputTypeName: string;
      creatorKey: string;
      reducerMethod: string;
    },
  ][] = [
    [
      "addLineItem",
      {
        storedName: "AddLineItem",
        actionType: "ADD_LINE_ITEM",
        inputTypeName: "AddLineItemInput",
        creatorKey: "addLineItem",
        reducerMethod: "addLineItemOperation",
      },
    ],
    [
      "parseHTTPResponse",
      {
        storedName: "ParseHttpResponse",
        actionType: "PARSE_HTTP_RESPONSE",
        inputTypeName: "ParseHttpResponseInput",
        creatorKey: "parseHttpResponse",
        reducerMethod: "parseHttpResponseOperation",
      },
    ],
    [
      "SET_GROUP_NAME",
      {
        storedName: "SetGroupName",
        actionType: "SET_GROUP_NAME",
        inputTypeName: "SetGroupNameInput",
        creatorKey: "setGroupName",
        reducerMethod: "setGroupNameOperation",
      },
    ],
    [
      "_leading",
      {
        storedName: "Leading",
        actionType: "LEADING",
        inputTypeName: "LeadingInput",
        creatorKey: "leading",
        reducerMethod: "leadingOperation",
      },
    ],
    [
      "item2Count",
      {
        storedName: "Item2Count",
        actionType: "ITEM2_COUNT",
        inputTypeName: "Item2CountInput",
        creatorKey: "item2Count",
        reducerMethod: "item2CountOperation",
      },
    ],
    [
      "x",
      {
        storedName: "X",
        actionType: "X",
        inputTypeName: "XInput",
        creatorKey: "x",
        reducerMethod: "xOperation",
      },
    ],
    [
      "A_B",
      {
        storedName: "AB",
        actionType: "A_B",
        inputTypeName: "ABInput",
        creatorKey: "aB",
        reducerMethod: "aBOperation",
      },
    ],
  ];

  it.each(rows)("derives every name for %j", (key, expected) => {
    expect(deriveDocumentModelOperationNames(key)).toStrictEqual(expected);
  });

  it("applies an explicit override per derived name", () => {
    expect(
      deriveDocumentModelOperationNames("addLineItem", {
        actionType: "ADD_ITEM",
        creatorKey: "addItem",
      }),
    ).toStrictEqual({
      storedName: "AddLineItem",
      actionType: "ADD_ITEM",
      inputTypeName: "AddLineItemInput",
      creatorKey: "addItem",
      reducerMethod: "addLineItemOperation",
    });
  });
});

describe("deriveDocumentModelModuleNames", () => {
  const rows: readonly [
    string,
    string,
    {
      storedName: string;
      operationsInterfaceName: string;
      actionNamespaceName: string;
    },
  ][] = [
    [
      "Invoice",
      "lineItems",
      {
        storedName: "LineItems",
        operationsInterfaceName: "InvoiceLineItemsOperations",
        actionNamespaceName: "invoiceLineItemsActions",
      },
    ],
    [
      "Vetra Package",
      "base_operations",
      {
        storedName: "BaseOperations",
        operationsInterfaceName: "VetraPackageBaseOperationsOperations",
        actionNamespaceName: "vetraPackageBaseOperationsActions",
      },
    ],
    [
      "DocumentDrive",
      "Node",
      {
        storedName: "Node",
        operationsInterfaceName: "DocumentDriveNodeOperations",
        actionNamespaceName: "documentDriveNodeActions",
      },
    ],
    [
      "HTTPServer",
      "x",
      {
        storedName: "X",
        operationsInterfaceName: "HttpServerXOperations",
        actionNamespaceName: "httpServerXActions",
      },
    ],
  ];

  it.each(rows)(
    "derives module names for model %j module %j",
    (modelName, moduleKey, expected) => {
      expect(
        deriveDocumentModelModuleNames(modelName, moduleKey),
      ).toStrictEqual(expected);
    },
  );

  it("applies an explicit override per derived name", () => {
    expect(
      deriveDocumentModelModuleNames("Invoice", "lineItems", {
        storedName: "line_items",
      }),
    ).toStrictEqual({
      storedName: "line_items",
      operationsInterfaceName: "InvoiceLineItemsOperations",
      actionNamespaceName: "invoiceLineItemsActions",
    });
  });
});

describe("deriveDocumentModelNames", () => {
  it("keeps the document type and derives the GraphQL and state root names", () => {
    expect(
      deriveDocumentModelNames({ id: "powerhouse/invoice", name: "Invoice" }),
    ).toStrictEqual({
      documentType: "powerhouse/invoice",
      graphQLName: "Invoice",
      globalStateRootName: "InvoiceState",
      localStateRootName: "InvoiceLocalState",
    });
    expect(
      deriveDocumentModelNames({
        id: "powerhouse/reactor-group",
        name: "Reactor Group",
      }),
    ).toStrictEqual({
      documentType: "powerhouse/reactor-group",
      graphQLName: "ReactorGroup",
      globalStateRootName: "ReactorGroupState",
      localStateRootName: "ReactorGroupLocalState",
    });
  });

  it("derives the state roots from an overridden GraphQL name", () => {
    expect(
      deriveDocumentModelNames(
        { id: "powerhouse/invoice", name: "Invoice" },
        { graphQLName: "Bill" },
      ),
    ).toStrictEqual({
      documentType: "powerhouse/invoice",
      graphQLName: "Bill",
      globalStateRootName: "BillState",
      localStateRootName: "BillLocalState",
    });
  });
});

describe("deriveDocumentModelErrorNames", () => {
  it("uses the authored name and code, otherwise the key", () => {
    expect(deriveDocumentModelErrorNames("InvoiceAlreadyIssued")).toStrictEqual(
      {
        key: "InvoiceAlreadyIssued",
        storedName: "InvoiceAlreadyIssued",
        storedCode: "InvoiceAlreadyIssued",
      },
    );
    expect(
      deriveDocumentModelErrorNames("InvoiceAlreadyIssued", {
        name: null,
        code: "INVOICE_ALREADY_ISSUED",
      }),
    ).toStrictEqual({
      key: "InvoiceAlreadyIssued",
      storedName: "InvoiceAlreadyIssued",
      storedCode: "INVOICE_ALREADY_ISSUED",
    });
    expect(
      deriveDocumentModelErrorNames("issued", { name: "", code: "" }),
    ).toStrictEqual({ key: "issued", storedName: "", storedCode: "" });
  });
});

type SchemaFirstModel = {
  readonly name: string;
  readonly specifications: readonly {
    readonly modules: readonly {
      readonly name: string;
      readonly operations: readonly {
        readonly name: string | null;
        readonly schema: string | null;
      }[];
    }[];
  }[];
};

type ParityFixture = {
  readonly json: string;
  readonly generatedRoot: string;
  readonly directories: Readonly<Record<string, string>>;
  readonly interfaceFile: "operations.ts" | "actions.ts";
  readonly namespaceExports: boolean;
};

const fixtures: readonly ParityFixture[] = [
  {
    json: "packages/shared/document-drive/document-drive.json",
    generatedRoot: "packages/shared/document-drive/gen",
    directories: { Node: "node", Drive: "drive" },
    interfaceFile: "actions.ts",
    namespaceExports: false,
  },
  {
    json: "packages/reactor-group/document-models/reactor-group/reactor-group.json",
    generatedRoot:
      "packages/reactor-group/document-models/reactor-group/v1/gen",
    directories: { group: "group" },
    interfaceFile: "operations.ts",
    namespaceExports: true,
  },
  {
    json: "packages/vetra/document-models/vetra-package/vetra-package.json",
    generatedRoot: "packages/vetra/document-models/vetra-package/v1/gen",
    directories: { base_operations: "base-operations" },
    interfaceFile: "operations.ts",
    namespaceExports: true,
  },
];

describe("parity with the committed schema-first output", () => {
  const checkedOperations: string[] = [];

  it.each(fixtures)("matches the generated files of $json", (fixture) => {
    const model = JSON.parse(read(fixture.json)) as SchemaFirstModel;
    const specification = model.specifications[model.specifications.length - 1];
    for (const module of specification.modules) {
      const directory = fixture.directories[module.name];
      expect(directory, module.name).toBeDefined();
      const moduleNames = deriveDocumentModelModuleNames(
        model.name,
        module.name,
      );
      const interfaces = read(
        `${fixture.generatedRoot}/${directory}/${fixture.interfaceFile}`,
      );
      expect(interfaces).toContain(
        `export interface ${moduleNames.operationsInterfaceName} {`,
      );
      if (fixture.namespaceExports) {
        expect(read(`${fixture.generatedRoot}/creators.ts`)).toContain(
          `export * as ${moduleNames.actionNamespaceName} from "./${directory}/creators.js";`,
        );
      }
      const creators = read(
        `${fixture.generatedRoot}/${directory}/creators.ts`,
      );
      const actions = read(`${fixture.generatedRoot}/${directory}/actions.ts`);
      for (const operation of module.operations) {
        if (operation.name === null) continue;
        const names = deriveDocumentModelOperationNames(operation.name);
        expect(creators).toMatch(
          new RegExp(`^export (const|function) ${names.creatorKey}\\b`, "m"),
        );
        expect(creators).toContain(`"${names.actionType}"`);
        if (operation.schema !== null) {
          expect(actions).toMatch(
            new RegExp(
              `type: "${names.actionType}";\\s*input: ${names.inputTypeName}\\b`,
            ),
          );
        }
        expect(interfaces).toContain(`${names.reducerMethod}: (`);
        checkedOperations.push(`${model.name}/${names.creatorKey}`);
      }
    }
  });

  it("covered at least five real operations across three models", () => {
    expect(checkedOperations.length).toBeGreaterThanOrEqual(5);
    expect(checkedOperations).toEqual(
      expect.arrayContaining([
        "DocumentDrive/addFile",
        "DocumentDrive/setDriveName",
        "Reactor Group/setGroupName",
        "Reactor Group/addMember",
        "Vetra Package/setPackageName",
      ]),
    );
  });
});

function moduleNames(
  modelName: string,
  moduleKey: string,
  operationKeys: readonly string[],
  overrides: Partial<
    Record<string, Parameters<typeof deriveDocumentModelOperationNames>[1]>
  > = {},
): DerivedModuleNames {
  return {
    key: moduleKey,
    names: deriveDocumentModelModuleNames(modelName, moduleKey),
    operations: operationKeys.map((key) => ({
      key,
      names: deriveDocumentModelOperationNames(key, overrides[key]),
    })),
  };
}

describe("checkDerivedNameCollisions", () => {
  it("returns nothing for distinct names", () => {
    expect(
      checkDerivedNameCollisions([
        moduleNames("Invoice", "lineItems", ["addLineItem", "removeLineItem"]),
        moduleNames("Invoice", "lifecycle", ["issue", "void"]),
      ]),
    ).toStrictEqual([]);
  });

  it("keeps module and operation stored names in separate namespaces", () => {
    expect(
      checkDerivedNameCollisions([
        moduleNames("Invoice", "update", ["update"]),
      ]),
    ).toStrictEqual([]);
  });

  it("scopes stored operation names to their module", () => {
    expect(
      checkDerivedNameCollisions([
        moduleNames("Invoice", "draft", ["create"], {
          create: { storedName: "Update" },
        }),
        moduleNames("Invoice", "published", ["replace"], {
          replace: { storedName: "Update" },
        }),
      ]),
    ).toStrictEqual([]);
  });

  it("reports one action collision naming both operation paths", () => {
    const diagnostics = checkDerivedNameCollisions([
      moduleNames("Invoice", "lineItems", ["addLineItem", "ADD_LINE_ITEM"]),
    ]);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({
      code: "PH-DM-DUPLICATE-ACTION",
      severity: "error",
      path: ["modules", "lineItems", "operations", "ADD_LINE_ITEM"],
      related: [
        {
          path: ["modules", "lineItems", "operations", "addLineItem"],
          message: 'operation "lineItems.addLineItem" derives the same names.',
        },
      ],
    });
    expect(diagnostics[0].message).toBe(
      'operation "lineItems.ADD_LINE_ITEM" derives actionType "ADD_LINE_ITEM", storedName "AddLineItem", inputTypeName "AddLineItemInput", creatorKey "addLineItem", reducerMethod "addLineItemOperation", already derived by operation "lineItems.addLineItem".',
    );
    expect(diagnostics[0].repair).toBe(
      'Rename operation "lineItems.ADD_LINE_ITEM" or operation "lineItems.addLineItem" so their derived names differ.',
    );
  });

  it("finds action collisions across modules", () => {
    const diagnostics = checkDerivedNameCollisions([
      moduleNames("Invoice", "lineItems", ["setName"]),
      moduleNames("Invoice", "lifecycle", ["set_name"]),
    ]);
    expect(diagnostics.map((d) => [d.code, d.path])).toStrictEqual([
      [
        "PH-DM-DUPLICATE-ACTION",
        ["modules", "lifecycle", "operations", "set_name"],
      ],
    ]);
  });

  it("reports a module collision once, naming both modules", () => {
    const diagnostics = checkDerivedNameCollisions([
      moduleNames("Invoice", "lineItems", ["addLineItem"]),
      moduleNames("Invoice", "line_items", ["removeLineItem"]),
    ]);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({
      code: "PH-DM-DUPLICATE-NAME",
      path: ["modules", "line_items"],
      message:
        'module "line_items" derives storedName "LineItems", operationsInterfaceName "InvoiceLineItemsOperations", actionNamespaceName "invoiceLineItemsActions", already derived by module "lineItems".',
      related: [{ path: ["modules", "lineItems"] }],
    });
  });

  it("uses the name code when only an overridden creator key collides", () => {
    const diagnostics = checkDerivedNameCollisions([
      moduleNames("Invoice", "lineItems", ["addLineItem", "appendLineItem"], {
        appendLineItem: { creatorKey: "addLineItem" },
      }),
    ]);
    expect(diagnostics.map((d) => [d.code, d.received])).toStrictEqual([
      ["PH-DM-DUPLICATE-NAME", 'creatorKey "addLineItem"'],
    ]);
  });

  it("uses the name code when only an overridden reducer method collides", () => {
    const diagnostics = checkDerivedNameCollisions([
      moduleNames("Invoice", "lineItems", ["addLineItem", "appendLineItem"], {
        appendLineItem: { reducerMethod: "addLineItemOperation" },
      }),
    ]);
    expect(diagnostics.map((d) => [d.code, d.received])).toStrictEqual([
      ["PH-DM-DUPLICATE-NAME", 'reducerMethod "addLineItemOperation"'],
    ]);
  });

  it("lets two modules share a reducer method name", () => {
    expect(
      checkDerivedNameCollisions([
        moduleNames("Invoice", "a", ["addItem"]),
        moduleNames("Invoice", "b", ["addItemB"], {
          addItemB: { reducerMethod: "addItemOperation" },
        }),
      ]),
    ).toStrictEqual([]);
  });

  it("uses the name code when only an overridden input type collides", () => {
    const diagnostics = checkDerivedNameCollisions([
      moduleNames("Invoice", "lineItems", ["addLineItem", "appendLineItem"], {
        appendLineItem: { inputTypeName: "AddLineItemInput" },
      }),
    ]);
    expect(diagnostics.map((d) => [d.code, d.received])).toStrictEqual([
      ["PH-DM-DUPLICATE-NAME", 'inputTypeName "AddLineItemInput"'],
    ]);
  });

  it("reports a three-way collision against the first declaration each time", () => {
    const diagnostics = checkDerivedNameCollisions([
      moduleNames("Invoice", "a", ["setName"]),
      moduleNames("Invoice", "b", ["SET_NAME"]),
      moduleNames("Invoice", "c", ["set_name"]),
    ]);
    expect(
      diagnostics.map((d) => [d.path[1], d.related?.[0].path[1]]),
    ).toStrictEqual([
      ["b", "a"],
      ["c", "a"],
    ]);
  });
});

describe("change-case stays behind naming.ts", () => {
  it("is imported by no other file under src/definition", () => {
    const definitionRoot = new URL("../../src/definition/", import.meta.url);
    const importers = readdirSync(definitionRoot, {
      recursive: true,
      withFileTypes: true,
    })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
      .map((entry) => ({
        name: entry.name,
        source: readFileSync(`${entry.parentPath}/${entry.name}`, "utf8"),
      }))
      .filter(({ source }) =>
        /from\s+["']change-case["']|require\(\s*["']change-case["']\s*\)/.test(
          source,
        ),
      )
      .map(({ name }) => name);
    expect(importers).toStrictEqual(["naming.ts"]);
  });
});
