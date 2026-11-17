/** Writing compat/vN: the names the schema-first code exported, derived from the code-first model. */
import { posix } from "node:path";
import { camelCase, pascalCase } from "change-case";
import { Kind } from "graphql";
import { Node, type SourceFile } from "ts-morph";
import {
  literal,
  type ModulePlan,
  sourceFile,
  type VersionContext,
} from "./context.js";
import { looseTypes, typeKinds } from "./definition.js";

/**
 * graphql-codegen's helper types and zod helpers, which compat keeps only
 * when a file imports them. Maybe, InputMaybe and Scalars are always kept.
 */
export const OPTIONAL_HELPERS = new Set([
  "Exact",
  "MakeOptional",
  "MakeMaybe",
  "MakeEmpty",
  "Incremental",
  "isDefinedNonNullAny",
  "definedNonNullAnySchema",
]);

/** The members of DocumentModelUtils, which a module's utils must keep. */
export const MODEL_UTILS = new Set([
  "fileExtension",
  "createState",
  "createDocument",
  "loadFromInput",
  "saveToFileHandle",
  "isStateOfType",
  "assertIsStateOfType",
  "isDocumentOfType",
  "assertIsDocumentOfType",
]);

/** The text of `name`'s declaration in `file`, when it is a type alias there. */
export function typeAliasText(file: SourceFile | undefined, name: string) {
  const alias = file?.getTypeAlias(name);
  if (alias === undefined) return undefined;
  const text = alias.getText();
  return alias.isExported() ? text : `export ${text}`;
}

export type CompatHome = "schema" | "index";

export type CompatResult = {
  readonly schema: string;
  readonly index: string;
  readonly provides: ReadonlyMap<string, CompatHome>;
};

/**
 * The version's public names, as the schema-first barrel exported them,
 * derived from the code-first declarations.
 */
export function compatFileText(
  context: VersionContext,
  plans: readonly ModulePlan[],
  legacyNames: ReadonlyMap<string, Node>,
  keeps: {
    readonly hooks: boolean;
    readonly custom: boolean;
    /** Specifier of the module whose exports merge into utils. */
    readonly customUtils: string | undefined;
    /** The family manifest's name, for the latest version only. */
    readonly latestManifest: string | undefined;
    /** Whether some file of the package imports this generated name. */
    readonly imported: (name: string) => boolean;
  },
): CompatResult {
  const { modelPascal: P, modelCamel, version, types, globalRoot } = context;
  const kinds = typeKinds(types);
  /** Where each name lives: schema.ts needs only the definition; index.ts reads the family. */
  const provides = new Map<string, CompatHome>();
  const lines: Record<CompatHome, string[]> = { schema: [], index: [] };
  const typeOnly = new Set<string>();
  const emit = (name: string, text: string, home: CompatHome = "index") => {
    if (provides.has(name)) return;
    provides.set(name, home);
    if (/^export (?:type|interface) /.test(text)) typeOnly.add(name);
    lines[home].push(text);
  };
  const module = `${P}V${version}`;
  /** The module file that declares an input, as a namespace of schema.ts. */
  const inputFiles = new Map(
    [...new Set(context.inputHomes.values())].map((plan) => [
      plan,
      {
        namespace: `${plan.constName}Inputs`,
        specifier: `../../v${version}/modules/${posix.basename(plan.path, ".ts")}.js`,
      },
    ]),
  );
  const holder = (name: string) => {
    const home = context.inputHomes.get(name);
    return home === undefined ? "declared" : inputFiles.get(home)!.namespace;
  };
  const operations = plans.flatMap((plan) =>
    plan.stored.operations.map((operation) => {
      const key = camelCase(operation.name);
      return {
        plan,
        key,
        pascal: pascalCase(key),
        scope: operation.scope === "local" ? "local" : "global",
      };
    }),
  );
  const schemaTypes = context.input.files.has(
    `${context.dir}/gen/schema/types.ts`,
  )
    ? sourceFile(
        context.project,
        context.input,
        `${context.dir}/gen/schema/types.ts`,
      )
    : undefined;

  emit(P, `export const ${P} = ${module};`);
  emit("reducer", `export const reducer = ${P}.reducer;`);
  emit("actions", `export const actions = ${P}.actions;`);
  emit(
    "utils",
    keeps.customUtils !== undefined
      ? `export const utils = { ...${P}.utils, ...customUtils };`
      : `export const utils = ${P}.utils;`,
  );
  // The code-first model stores each module and operation under the
  // PascalCase of its key. Code that read the stored names, as action types
  // for instance, gets the names the schema-first specification stored.
  const storedNames = context.model.specifications.flatMap((specification) =>
    specification.modules.flatMap((module) => [
      ...(pascalCase(camelCase(module.name)) === module.name
        ? []
        : [
            [
              `module/${specification.version}/${pascalCase(camelCase(module.name))}`,
              module.name,
            ] as const,
          ]),
      ...module.operations.flatMap((operation) =>
        pascalCase(camelCase(operation.name)) === operation.name
          ? []
          : [
              [
                `operation/${specification.version}/${pascalCase(camelCase(operation.name))}`,
                operation.name,
              ] as const,
            ],
      ),
    ]),
  );
  emit(
    "documentModel",
    storedNames.length === 0
      ? `export const documentModel = ${P}.documentModel.global;`
      : `/** The module and operation names the schema-first specification stored, by version and code-first name. */
const storedNames: Readonly<Record<string, string>> = ${literal(Object.fromEntries(storedNames))};

/**
 * The model's document model under the module and operation names its
 * schema-first specification stored, which code may read, such as as action
 * types. ${P}.documentModel.global has the code-first names.
 */
export const documentModel: typeof ${P}.documentModel.global = {
  ...${P}.documentModel.global,
  specifications: ${P}.documentModel.global.specifications.map((specification) => ({
    ...specification,
    modules: specification.modules.map((module) => ({
      ...module,
      name: storedNames[\`module/\${specification.version}/\${module.name}\`] ?? module.name,
      operations: module.operations.map((operation) => ({
        ...operation,
        name: storedNames[\`operation/\${specification.version}/\${operation.name}\`] ?? operation.name,
      })),
    })),
  })),
};`,
  );
  if (keeps.latestManifest !== undefined) {
    emit(
      "supportedVersions",
      `export const { supportedVersions, latestVersion } = ${keeps.latestManifest};`,
    );
    provides.set("latestVersion", "index");
  }
  emit(
    `${modelCamel}DocumentType`,
    `export const ${modelCamel}DocumentType = ${literal(context.model.id)};`,
    "schema",
  );
  lines.schema.push(
    "type Mutable<T> = T extends readonly (infer TItem)[]\n  ? Mutable<TItem>[]\n  : T extends object\n    ? { -readonly [K in keyof T]: Mutable<T[K]> }\n    : T;",
  );
  // graphql-codegen names a type in PascalCase per underscore-separated part,
  // so the SDL type OSQCursor is the TypeScript type OsqCursor.
  const originalNames = new Map(
    [...context.renamed].map(([from, to]) => [to, from]),
  );
  const tsNames = new Map(
    [...types.keys()].map((current) => {
      const name = originalNames.get(current) ?? current;
      const convention = name
        .split("_")
        .map((part) => (part === "" ? part : pascalCase(part)))
        .join("_");
      const tsName = legacyNames.has(name)
        ? name
        : legacyNames.has(convention)
          ? convention
          : name;
      return [current, tsName] as const;
    }),
  );
  const sdlNames = new Map([...tsNames].map(([sdl, ts]) => [ts, sdl]));
  const loose = looseTypes(context);
  for (const [name, tsName] of tsNames) {
    // A recursive type's descriptor has no field types; its generated alias does.
    const exact = loose.has(name)
      ? typeAliasText(schemaTypes, tsName)
      : undefined;
    if (loose.has(name)) {
      context.notes.push(
        exact === undefined
          ? `Version ${version}: ${name} refers to a type declared after it, as a recursive type does, so TypeScript sees its fields as any, in the reducers and in compat/v${version}.`
          : `Version ${version}: ${name} refers to a type declared after it, as a recursive type does, so the reducers see its fields as any; compat/v${version} keeps its generated type.`,
      );
    }
    emit(
      tsName,
      exact ??
        (kinds.get(name) === "input"
          ? `export type ${tsName} = InputOf<typeof ${holder(name)}.${name}>;`
          : `export type ${tsName} = Mutable<SourceOf<typeof ${holder(name)}.${name}>>;`),
      "schema",
    );
  }
  emit(
    `${P}GlobalState`,
    `export type ${P}GlobalState = GlobalStateOf<typeof ${P}>;`,
  );
  emit(
    `${P}LocalState`,
    `export type ${P}LocalState = LocalStateOf<typeof ${P}>;`,
  );
  emit(
    `${P}PHState`,
    `export type ${P}PHState = PHBaseState & { global: ${P}GlobalState; local: ${P}LocalState };`,
  );
  emit(`${P}Document`, `export type ${P}Document = PHDocument<${P}PHState>;`);

  if (operations.length > 0) {
    emit(
      "creators",
      `export const { ${operations.map(({ key }) => key).join(", ")} } = ${P}.actions;`,
    );
    provides.delete("creators");
    for (const { key } of operations) provides.set(key, "index");
  }
  for (const { key, pascal } of operations) {
    emit(
      `${pascal}Action`,
      `export type ${pascal}Action = ReturnType<typeof ${key}>;`,
    );
  }
  for (const plan of plans) {
    const own = operations.filter((operation) => operation.plan === plan);
    const union =
      own.length === 0
        ? "never"
        : own.map(({ pascal }) => `${pascal}Action`).join(" | ");
    emit(
      `${P}${plan.pascal}Action`,
      `export type ${P}${plan.pascal}Action = ${union};`,
    );
    emit(
      `${P}${plan.pascal}Operations`,
      `export interface ${P}${plan.pascal}Operations {\n${own
        .map(
          ({ key, pascal, scope }) =>
            `  ${key}Operation: (state: ${P}${scope === "local" ? "Local" : "Global"}State, action: ${pascal}Action, dispatch?: SignalDispatch) => void;`,
        )
        .join("\n")}\n}`,
    );
    emit(
      `${modelCamel}${plan.pascal}Actions`,
      `export const ${modelCamel}${plan.pascal}Actions = { ${own.map(({ key }) => key).join(", ")} };`,
    );
  }
  emit(
    `${P}Action`,
    `export type ${P}Action = ${plans.length === 0 ? "never" : plans.map((plan) => `${P}${plan.pascal}Action`).join(" | ")};`,
  );

  lines.index.push(
    `// Assertion functions need an explicitly typed receiver.\nconst modelUtils: DocumentModelUtils<${P}PHState> = ${P}.utils;`,
  );
  const guards: [string, string][] = [
    [
      `is${P}Document`,
      `export function is${P}Document(document: unknown): document is ${P}Document {\n  return modelUtils.isDocumentOfType(document);\n}`,
    ],
    [
      `assertIs${P}Document`,
      `export function assertIs${P}Document(document: unknown): asserts document is ${P}Document {\n  modelUtils.assertIsDocumentOfType(document);\n}`,
    ],
    [
      `is${P}State`,
      `export function is${P}State(state: unknown): state is ${P}PHState {\n  return modelUtils.isStateOfType(state);\n}`,
    ],
    [
      `assertIs${P}State`,
      `export function assertIs${P}State(state: unknown): asserts state is ${P}PHState {\n  modelUtils.assertIsStateOfType(state);\n}`,
    ],
  ];
  for (const [name, text] of guards) emit(name, text);

  const factories: [string, string][] = [
    [
      "initialGlobalState",
      `export const initialGlobalState: ${P}GlobalState = ${P}.utils.createState().global;`,
    ],
    [
      "initialLocalState",
      `export const initialLocalState: ${P}LocalState = ${P}.utils.createState().local;`,
    ],
    [
      "defaultGlobalState",
      `export function defaultGlobalState(): ${P}GlobalState {\n  return ${P}.utils.createState().global;\n}`,
    ],
    [
      "defaultLocalState",
      `export function defaultLocalState(): ${P}LocalState {\n  return ${P}.utils.createState().local;\n}`,
    ],
    [
      "defaultPHState",
      `export function defaultPHState(): ${P}PHState {\n  return { ...defaultBaseState(), global: defaultGlobalState(), local: defaultLocalState() };\n}`,
    ],
    [
      "createGlobalState",
      `export function createGlobalState(state?: Partial<${P}GlobalState>): ${P}GlobalState {\n  return { ...defaultGlobalState(), ...(state || {}) };\n}`,
    ],
    [
      "createLocalState",
      `export function createLocalState(state?: Partial<${P}LocalState>): ${P}LocalState {\n  return { ...defaultLocalState(), ...(state || {}) } as ${P}LocalState;\n}`,
    ],
    [
      "createState",
      `export function createState(baseState?: Partial<PHBaseState>, globalState?: Partial<${P}GlobalState>, localState?: Partial<${P}LocalState>): ${P}PHState {\n  return { ...createBaseState(baseState?.auth, baseState?.document), global: createGlobalState(globalState), local: createLocalState(localState) };\n}`,
    ],
    [
      `create${P}Document`,
      `export function create${P}Document(state?: Partial<{ auth?: Partial<PHAuthState>; document?: Partial<PHDocumentState>; global?: Partial<${P}GlobalState>; local?: Partial<${P}LocalState> }>): ${P}Document {\n  return ${P}.utils.createDocument(createState(createBaseState(state?.auth, { version: ${version}, ...state?.document }), state?.global, state?.local)) as ${P}Document;\n}`,
    ],
  ];
  for (const [name, text] of factories) emit(name, text);

  for (const [name, node] of legacyNames) {
    if (provides.has(name)) continue;
    const tsBase = name.endsWith("Schema")
      ? name.slice(0, -"Schema".length)
      : undefined;
    const base = tsBase === undefined ? undefined : sdlNames.get(tsBase);
    if (base !== undefined) {
      // The kind the generated helper had, which the validator is at runtime.
      const kind = types.get(base)!.node.kind;
      const valueType =
        kind === Kind.ENUM_TYPE_DEFINITION
          ? `z.ZodEnum<{ [K in ${tsBase}]: K }>`
          : kind === Kind.UNION_TYPE_DEFINITION
            ? `z.ZodType<${tsBase}>`
            : `z.ZodObject<Properties<${tsBase}>>`;
      emit(
        name,
        Node.isVariableDeclaration(node)
          ? `export const ${name} = ${holder(base)}.${base}.validator as unknown as ${valueType};`
          : `export function ${name}(): ${valueType} {\n  return ${holder(base)}.${base}.validator as unknown as ${valueType};\n}`,
        "schema",
      );
      continue;
    }
    if (name === `${P}Controller`) {
      emit(
        name,
        `export const ${P}Controller = PHDocumentController.forDocumentModel<${P}PHState, ${P}Action>(${P} as unknown as DocumentModelModule<${P}PHState>);`,
      );
      continue;
    }
    if (name === `${P}PHStateSchema`) {
      emit(
        name,
        `export const ${P}PHStateSchema = BaseDocumentStateSchema.extend({ global: declared.${globalRoot}.validator });`,
        "schema",
      );
      continue;
    }
    if (name === `${P}DocumentHeaderSchema`) {
      emit(
        name,
        `export const ${P}DocumentHeaderSchema = BaseDocumentHeaderSchema.extend({ documentType: z.literal(${modelCamel}DocumentType) });`,
        "schema",
      );
      continue;
    }
    if (name === `${P}DocumentSchema`) {
      emit(
        name,
        `export const ${P}DocumentSchema = z.object({ header: ${P}DocumentHeaderSchema, state: ${P}PHStateSchema, initialState: ${P}PHStateSchema });`,
        "schema",
      );
      continue;
    }
    // graphql-codegen's helpers are kept only for the files that import them.
    if (OPTIONAL_HELPERS.has(name) && !keeps.imported(name)) continue;
    if (name === "isDefinedNonNullAny" || name === "definedNonNullAnySchema") {
      const helpers = sourceFile(
        context.project,
        context.input,
        `${context.dir}/gen/schema/zod.ts`,
      );
      const statement = helpers
        .getVariableDeclaration(name)
        ?.getVariableStatement();
      if (statement !== undefined) {
        const alias = typeAliasText(helpers, "definedNonNullAny");
        if (alias !== undefined) emit("definedNonNullAny", alias, "schema");
        const text = statement.getText();
        emit(name, statement.isExported() ? text : `export ${text}`, "schema");
      }
      continue;
    }
    const alias = typeAliasText(schemaTypes, name);
    if (alias !== undefined) emit(name, alias, "schema");
  }
  // The document schemas reference one another; emit the ones they need.
  if (provides.has(`${P}DocumentSchema`)) {
    for (const needed of [`${P}PHStateSchema`, `${P}DocumentHeaderSchema`]) {
      if (provides.has(needed)) continue;
      if (needed.endsWith("PHStateSchema")) {
        emit(
          needed,
          `const ${needed} = BaseDocumentStateSchema.extend({ global: declared.${globalRoot}.validator });`,
          "schema",
        );
      } else {
        emit(
          needed,
          `const ${needed} = BaseDocumentHeaderSchema.extend({ documentType: z.literal(${modelCamel}DocumentType) });`,
          "schema",
        );
      }
      provides.delete(needed);
    }
  }
  const header = (what: string) => `/**
 * Version ${version} of the ${context.model.name} document model, under the names
 * its schema-first code exported, for the editors, processors and tests that
 * use them. ${what}
 * Written by ph migrate. New code can use ${P}V${version} and
 * DocumentOf<typeof ${P}V${version}> from the model instead.
 */`;
  if (lines.schema.some((line) => line.includes("Properties<"))) {
    lines.schema.push(
      "type Properties<T> = Required<{ [K in keyof T]: z.ZodType<T[K]> }>;",
    );
  }
  const schema = lines.schema.join("\n\n");
  const index = lines.index.join("\n\n");
  // A type of the definition, such as the local state's, is declared in schema.ts.
  const fromSchema = [...provides]
    .filter(
      ([name, home]) =>
        home === "schema" && new RegExp(`\\b${name}\\b`).test(index),
    )
    .map(([name]) => (typeOnly.has(name) ? `type ${name}` : name));
  const reexports = [
    `export * from "./schema.js";`,
    keeps.hooks ? `export * from "./hooks.js";` : "",
    keeps.custom ? `export * from "./custom.js";` : "",
  ].filter((line) => line !== "");
  return {
    schema: `${header(
      inputFiles.size === 0
        ? `The types and schemas, which read only ../../v${version}/definition.ts.`
        : `The types and schemas, which read ../../v${version}/definition.ts and the inputs its modules declare.`,
    )}\n${compatImports(schema, version, [
      ...[...inputFiles.values()]
        .filter(({ namespace }) =>
          new RegExp(`\\b${namespace}\\.`).test(schema),
        )
        .map(({ namespace, specifier }) =>
          new RegExp(`\\b${namespace}\\.\\w+\\.validator`).test(schema)
            ? `import * as ${namespace} from ${literal(specifier)};`
            : `import type * as ${namespace} from ${literal(specifier)};`,
        ),
    ])}\n\n${schema}\n`,
    index: `${header("The module and what reads it, from ../../index.ts.")}\n${compatImports(
      index,
      version,
      [
        `import { ${[module, keeps.latestManifest].filter(Boolean).join(", ")} } from "../../index.js";`,
        fromSchema.length > 0
          ? `import { ${fromSchema.join(", ")} } from "./schema.js";`
          : "",
        keeps.customUtils !== undefined
          ? `import * as customUtils from ${literal(keeps.customUtils)};`
          : "",
      ],
    )}\n\n${index}\n\n${reexports.join("\n")}\n`,
    provides,
  };
}

export const DOCUMENT_MODEL_VALUES = [
  "BaseDocumentHeaderSchema",
  "BaseDocumentStateSchema",
  "PHDocumentController",
  "createBaseState",
  "defaultBaseState",
];

export const DOCUMENT_MODEL_TYPES = [
  "DocumentModelModule",
  "DocumentModelUtils",
  "GlobalStateOf",
  "InputOf",
  "LocalStateOf",
  "PHAuthState",
  "PHBaseState",
  "PHDocument",
  "PHDocumentState",
  "SignalDispatch",
  "SourceOf",
];

/** The imports a compatibility file's `text` uses. */
export function compatImports(
  text: string,
  version: number,
  extra: readonly string[],
): string {
  const uses = (name: string) => new RegExp(`\\b${name}\\b`).test(text);
  const values = DOCUMENT_MODEL_VALUES.filter(uses);
  const types = DOCUMENT_MODEL_TYPES.filter(uses);
  const fromModel = [...values, ...types.map((name) => `type ${name}`)];
  const declared = /\bdeclared\./.test(text)
    ? /declared\.\w+\.validator/.test(text)
      ? `import * as declared from "../../v${version}/definition.js";`
      : `import type * as declared from "../../v${version}/definition.js";`
    : "";
  return [
    fromModel.length > 0
      ? `import { ${fromModel.join(", ")} } from "document-model";`
      : "",
    /\bz\./.test(text) ? `import { z } from "zod";` : "",
    /(?<!\.)\bZodType</.test(text) ? `import type { ZodType } from "zod";` : "",
    declared,
    ...extra.filter((line) => line !== ""),
  ]
    .filter((line) => line !== "")
    .join("\n");
}

/** The class declarations and error-code types of each generated error file. */
export function errorsFileText(
  context: VersionContext,
  errorFiles: readonly string[],
): { readonly text: string; readonly names: Set<string> } | undefined {
  if (context.errorsNeeded.size === 0) return undefined;
  const classes = new Map<string, string>();
  const codes = new Set<string>();
  for (const path of errorFiles) {
    const file = sourceFile(context.project, context.input, path);
    for (const declaration of file.getClasses()) {
      const name = declaration.getName();
      if (
        name === undefined ||
        classes.has(name) ||
        !context.errorsNeeded.has(name)
      ) {
        continue;
      }
      const text = declaration.getText();
      classes.set(name, declaration.isExported() ? text : `export ${text}`);
    }
    const alias = file.getTypeAlias("ErrorCode")?.getTypeNode();
    if (alias !== undefined) {
      for (const member of Node.isUnionTypeNode(alias)
        ? alias.getTypeNodes()
        : [alias]) {
        codes.add(member.getText());
      }
    }
  }
  if (classes.size === 0) return undefined;
  const text = `/**
 * Error classes of version ${context.version} of ${context.model.name} that code outside
 * the reducers declaring them throws or imports, kept from the schema-first
 * code. A reducer throws the classes its operation's context passes in errors.
 */
export type ErrorCode = ${codes.size === 0 ? "string" : [...codes].join(" | ")};

export interface ReducerError {
  errorCode: ErrorCode;
}

${[...classes.values()].join("\n\n")}
`;
  return {
    text,
    names: new Set(["ErrorCode", "ReducerError", ...classes.keys()]),
  };
}
