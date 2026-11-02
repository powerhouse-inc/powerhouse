import type {
  DocumentSpecification,
  OperationSpecification,
} from "@powerhousedao/shared/document-model";
import { pascalCase } from "change-case";
import { getCatalogScalar } from "document-model/scalars";
import {
  getNamedType,
  type GraphQLInputObjectType,
  type GraphQLInputType,
  type GraphQLNamedType,
  type GraphQLSchema,
  type InputObjectTypeDefinitionNode,
  isInputObjectType,
  isListType,
  isNonNullType,
  Kind,
  parse,
  specifiedScalarTypes,
} from "graphql";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { GENERATE_MOCK_NAME } from "../utils/generate-mock-import.js";
import { resolveFromCodegen } from "./resolve-from-codegen.js";
import { buildSpecificationSchema } from "./specification-schema.js";

const PROJECT_SCALARS_MODULE = "scalars/index";

const graphqlBuiltInScalarNames = new Set(
  specifiedScalarTypes.map((type) => type.name),
);

function specificationSdls(specification: DocumentSpecification): string[] {
  return [
    ...Object.values(specification.state).map((state) => state.schema),
    ...specification.modules.flatMap((module) =>
      module.operations.map((operation) => operation.schema ?? ""),
    ),
  ];
}

export function getProjectScalarNames(
  specification: DocumentSpecification,
): string[] {
  const names = new Set<string>();
  for (const sdl of specificationSdls(specification)) {
    if (!sdl.trim()) continue;
    let doc;
    try {
      doc = parse(sdl);
    } catch {
      continue;
    }
    for (const definition of doc.definitions) {
      if (
        definition.kind === Kind.SCALAR_TYPE_DEFINITION &&
        !graphqlBuiltInScalarNames.has(definition.name.value) &&
        !getCatalogScalar(definition.name.value)
      ) {
        names.add(definition.name.value);
      }
    }
  }
  return [...names].sort();
}

export function assertProjectScalarsModuleExists(args: {
  modelName: string;
  specifications: readonly DocumentSpecification[];
  projectDir: string;
}) {
  const { modelName, specifications, projectDir } = args;
  const names = [
    ...new Set(specifications.flatMap(getProjectScalarNames)),
  ].sort();
  if (names.length === 0) return;
  if (existsSync(path.join(projectDir, `${PROJECT_SCALARS_MODULE}.ts`))) {
    return;
  }
  const declared =
    names.length === 1
      ? `scalar ${names[0]}, which is not a built-in scalar. Create ${PROJECT_SCALARS_MODULE}.ts and export it`
      : `scalars ${names.join(", ")}, which are not built-in scalars. Create ${PROJECT_SCALARS_MODULE}.ts and export them`;
  throw new Error(
    `Model ${modelName} declares ${declared} from there with defineScalar.`,
  );
}

export function projectScalarsImportPath(fromDir: string, projectDir: string) {
  const relative = path
    .relative(fromDir, path.join(projectDir, `${PROJECT_SCALARS_MODULE}.js`))
    .split(path.sep)
    .join("/");
  return relative.startsWith(".") ? relative : `./${relative}`;
}

export type ProjectScalars = {
  readonly names: readonly string[];
  readonly importPath: string;
};

export function projectScalarCodegenConfig({
  names,
  importPath,
}: ProjectScalars) {
  return {
    scalars: Object.fromEntries(
      names.map((name) => [
        name,
        `import("document-model/scalars").ScalarValue<typeof import("${importPath}").${name}>`,
      ]),
    ),
    scalarSchemas: Object.fromEntries(
      names.map((name) => [name, `${name}.schema`]),
    ),
    zodImport:
      names.length > 0
        ? `import { ${names.join(", ")} } from "${importPath}";`
        : null,
  };
}

function inListShape(type: GraphQLInputType, literal: string): string {
  if (isNonNullType(type)) return inListShape(type.ofType, literal);
  if (isListType(type)) return `[${inListShape(type.ofType, literal)}]`;
  return literal;
}

type InputFieldMock = {
  name: string;
  literal: string;
  projectScalars: readonly string[];
  inputSchemas: readonly string[];
};

let zodNameConverter: ((name: string) => string) | undefined;

// zod.ts names each input schema with the validation plugin's naming function,
// so the copy the plugin itself resolves is the one used here. It loads on the
// first call, so importing codegen does not load the plugin library.
function convertName(name: string): string {
  zodNameConverter ??= (
    createRequire(
      resolveFromCodegen("graphql-codegen-typescript-validation-schema"),
    )("@graphql-codegen/visitor-plugin-common") as {
      convertFactory: (config: object) => (name: string) => string;
    }
  ).convertFactory({});
  return zodNameConverter(name);
}

function projectScalarMock(
  type: GraphQLNamedType,
  projectScalarNames: ReadonlySet<string>,
  enclosing: ReadonlySet<string>,
): Omit<InputFieldMock, "name"> | undefined {
  if (projectScalarNames.has(type.name)) {
    return {
      literal: `${type.name}.example ?? ${GENERATE_MOCK_NAME}(${type.name}.schema)`,
      projectScalars: [type.name],
      inputSchemas: [],
    };
  }
  if (!isInputObjectType(type) || enclosing.has(type.name)) return undefined;
  const inner = new Set([...enclosing, type.name]);
  const nested = Object.values(type.getFields()).flatMap((field) => {
    const mock = projectScalarMock(
      getNamedType(field.type),
      projectScalarNames,
      inner,
    );
    return mock ? [{ field, mock }] : [];
  });
  if (nested.length === 0) return undefined;
  const schema = `${convertName(type.name)}Schema`;
  const overrides = nested
    .map(
      ({ field, mock }) =>
        `${field.name}: ${inListShape(field.type, mock.literal)}`,
    )
    .join(", ");
  return {
    literal: `${GENERATE_MOCK_NAME}(${schema}(), { ${overrides} })`,
    projectScalars: nested.flatMap(({ mock }) => mock.projectScalars),
    inputSchemas: [schema, ...nested.flatMap(({ mock }) => mock.inputSchemas)],
  };
}

export function getInputFieldMocks(
  inputType: GraphQLInputObjectType | undefined,
  stateFieldMocks: ReadonlyMap<string, string>,
  projectScalarNames: ReadonlySet<string>,
): InputFieldMock[] {
  if (!inputType) return [];
  return Object.values(inputType.getFields()).flatMap(
    (field): InputFieldMock[] => {
      const mock = projectScalarMock(
        getNamedType(field.type),
        projectScalarNames,
        new Set([inputType.name]),
      );
      if (mock) {
        return [
          {
            name: field.name,
            ...mock,
            literal: inListShape(field.type, mock.literal),
          },
        ];
      }
      const literal = stateFieldMocks.get(field.name);
      return literal === undefined
        ? []
        : [{ name: field.name, literal, projectScalars: [], inputSchemas: [] }];
    },
  );
}

function reachesProjectScalar(
  type: GraphQLNamedType | null | undefined,
  projectScalarNames: ReadonlySet<string>,
  visited: Set<string>,
): boolean {
  if (!type) return false;
  if (projectScalarNames.has(type.name)) return true;
  if (!isInputObjectType(type) || visited.has(type.name)) return false;
  visited.add(type.name);
  return Object.values(type.getFields()).some((field) =>
    reachesProjectScalar(getNamedType(field.type), projectScalarNames, visited),
  );
}

/**
 * The input type an operation's generated code parses: the one `zod.ts` names
 * `<Operation>InputSchema`, or else the SDL's first input type.
 */
export function operationInputType(
  schema: GraphQLSchema,
  operation: Pick<OperationSpecification, "name" | "schema">,
): GraphQLInputObjectType | undefined {
  if (!operation.name || !operation.schema) return undefined;
  const expected = convertName(`${pascalCase(operation.name)}Input`);
  const inputs = parse(operation.schema).definitions.filter(
    (node): node is InputObjectTypeDefinitionNode =>
      node.kind === Kind.INPUT_OBJECT_TYPE_DEFINITION,
  );
  const definition =
    inputs.find((node) => convertName(node.name.value) === expected) ??
    inputs.at(0);
  const type = definition && schema.getType(definition.name.value);
  return isInputObjectType(type) ? type : undefined;
}

export function getOperationsWithProjectScalarInput(
  specification: DocumentSpecification,
): ReadonlySet<string> {
  const projectScalarNames = new Set(getProjectScalarNames(specification));
  if (projectScalarNames.size === 0) return new Set();
  const schema = buildSpecificationSchema(specification);
  return new Set(
    specification.modules.flatMap((module) =>
      module.operations.flatMap((operation) =>
        operation.name !== null &&
        reachesProjectScalar(
          operationInputType(schema, operation),
          projectScalarNames,
          new Set(),
        )
          ? [operation.name]
          : [],
      ),
    ),
  );
}
