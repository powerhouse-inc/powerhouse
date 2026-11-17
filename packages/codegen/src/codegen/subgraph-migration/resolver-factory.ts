/** Locates the resolver map and the factory that returns it. */
import {
  type ArrowFunction,
  type CallExpression,
  type FunctionDeclaration,
  type FunctionExpression,
  type ImportSpecifier,
  type MethodDeclaration,
  Node,
  type ObjectLiteralExpression,
  type ParameterDeclaration,
  type Project,
  type PropertyDeclaration,
  type SourceFile,
  SyntaxKind,
} from "ts-morph";
import {
  importOf,
  type Input,
  lineOf,
  localModule,
  refuse,
  sourceFile,
  unwrap,
} from "./context.js";

export type FunctionLike =
  | ArrowFunction
  | FunctionExpression
  | FunctionDeclaration
  | MethodDeclaration;

/** Where the resolver map is, and the factory that returns it, if any. */
export type ResolverFactory = {
  readonly file: SourceFile;
  readonly map: ObjectLiteralExpression;
  readonly factory: { readonly name: string; readonly node?: FunctionLike };
  readonly param: ParameterDeclaration | undefined;
  /** The argument index.ts passes for `param`. */
  readonly argument?: Node;
  readonly preamble: readonly Node[];
  readonly statement?: Node;
  readonly importSpecifier?: ImportSpecifier;
  readonly importedFrom?: string;
};

export function resolverFactory(
  project: Project,
  input: Input,
  index: SourceFile,
  member: PropertyDeclaration,
): ResolverFactory {
  const indexPath = `${input.dir}/index.ts`;
  const value = unwrap(member.getInitializerOrThrow());
  if (Node.isObjectLiteralExpression(value)) {
    return {
      file: index,
      map: value,
      factory: { name: "resolvers" },
      param: undefined,
      preamble: [],
    };
  }
  // readResolverMap has checked the call and the factory's shape.
  const call = value as CallExpression;
  const callee = unwrap(call.getExpression()).getText();
  const args = call.getArguments();
  const binding = importOf(index, callee);
  const path =
    binding === undefined
      ? indexPath
      : localModule(input.files, input.dir, binding.specifier)!;
  const file = sourceFile(project, input, path);
  const name = binding?.imported ?? callee;
  const declaration =
    file.getFunction(name) ?? file.getVariableDeclarationOrThrow(name);
  const node = Node.isFunctionDeclaration(declaration)
    ? declaration
    : (unwrap(declaration.getInitializerOrThrow()) as FunctionLike);
  const statement = Node.isFunctionDeclaration(declaration)
    ? declaration
    : declaration.getVariableStatementOrThrow();
  if (
    Node.isVariableStatement(statement) &&
    statement.getDeclarations().length > 1
  ) {
    refuse(
      path,
      lineOf(statement),
      `${name} is declared together with other variables.`,
      `Declare ${name} in a statement of its own.`,
    );
  }
  const params = node.getParameters();
  // Any argument other than this becomes a field initialized with its text,
  // so a default the parameter would take, or an argument no parameter
  // receives, would no longer run.
  const passesThis =
    args.length === 1 && unwrap(args[0]).getKind() === SyntaxKind.ThisKeyword;
  if (
    params.length > 1 ||
    args.length > 1 ||
    (params.length === 0 && args.length === 1 && !passesThis) ||
    (params.length === 1 &&
      (args.length === 0 ||
        !Node.isIdentifier(params[0].getNameNode()) ||
        params[0].isRestParameter() ||
        (params[0].hasInitializer() && !passesThis)))
  ) {
    refuse(
      indexPath,
      lineOf(call),
      `resolvers is ${call.getText().split("\n")[0]}, and only a factory that takes one parameter, given one argument, can become class members. The parameter has no default unless the argument is this.`,
      `Call ${callee} with one argument, such as this or an object of what the resolvers need, and give its parameter no default.`,
    );
  }
  const body = node.getBody();
  let map: Node | undefined;
  let preamble: Node[] = [];
  if (body !== undefined && Node.isBlock(body)) {
    const statements = body.getStatements();
    const last = statements.at(-1);
    if (last !== undefined && Node.isReturnStatement(last)) {
      map = last.getExpression();
      preamble = statements.slice(0, -1);
    }
  } else if (body !== undefined) {
    map = body;
  }
  const literal = map === undefined ? undefined : unwrap(map);
  if (literal === undefined || !Node.isObjectLiteralExpression(literal)) {
    refuse(
      path,
      lineOf(node),
      `${name} does not end in a return of its resolver map.`,
      `Make the last statement of ${name} return the resolver map.`,
    );
  }
  const importSpecifier =
    binding === undefined
      ? undefined
      : index
          .getImportDeclarations()
          .flatMap((declaration) => declaration.getNamedImports())
          .find(
            (named) =>
              (named.getAliasNode() ?? named.getNameNode()).getText() ===
              callee,
          );
  const ownedCall = unwrap(call.getExpression());
  const declarationName = declaration.getNameNode();
  for (const nameNode of [
    declarationName,
    importSpecifier?.getAliasNode() ?? importSpecifier?.getNameNode(),
  ]) {
    if (nameNode === undefined || !Node.isIdentifier(nameNode)) continue;
    for (const reference of nameNode.findReferencesAsNodes()) {
      const source = reference.getSourceFile();
      if (source !== index && source !== file) continue;
      if (
        (declarationName !== undefined &&
          source === file &&
          reference.getStart() === declarationName.getStart() &&
          reference.getEnd() === declarationName.getEnd()) ||
        (source === index &&
          reference.getStart() === ownedCall.getStart() &&
          reference.getEnd() === ownedCall.getEnd()) ||
        (importSpecifier !== undefined &&
          reference.getFirstAncestorByKind(SyntaxKind.ImportSpecifier) ===
            importSpecifier)
      ) {
        continue;
      }
      refuse(
        source.getFilePath().slice(1),
        lineOf(reference),
        `${callee} is read outside the class's resolver initializer, so removing its binding would break that reader.`,
        "Move the additional reader and factory into a separate helper module, or keep this subgraph schema-first.",
      );
    }
  }
  return {
    file,
    map: literal,
    factory: { name, node },
    param: params[0],
    argument: args.at(0),
    preamble,
    statement,
    ...(importSpecifier && { importSpecifier }),
    ...(binding && { importedFrom: binding.specifier }),
  };
}
