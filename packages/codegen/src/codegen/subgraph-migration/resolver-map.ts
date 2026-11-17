/** Reads which types and fields the schema-first resolver map resolves. */
import {
  Node,
  type ObjectLiteralElementLike,
  type ObjectLiteralExpression,
  type Project,
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

type ResolverEntry = {
  readonly line: number;
  /** For a subscription: whether the original declares `resolve`. */
  readonly hasResolve: boolean;
};

export type ResolverType = {
  readonly line: number;
  readonly fields: ReadonlyMap<string, ResolverEntry>;
};

/**
 * Query and Mutation may be built by any expression: the class keeps the
 * object it returns and calls each field's resolver on it.
 */
const OPAQUE_ROOTS: ReadonlySet<string> = new Set(["Query", "Mutation"]);

/** The object literal a resolver initializer evaluates to, read without running it. */
export function readResolverMap(
  project: Project,
  input: Input,
  index: SourceFile,
  initializer: Node,
): ReadonlyMap<string, ResolverType> & { readonly file: string } {
  const indexPath = `${input.dir}/index.ts`;
  const value = unwrap(initializer);
  if (Node.isObjectLiteralExpression(value)) {
    return Object.assign(resolverTypes(value, indexPath), { file: indexPath });
  }
  const callee = Node.isCallExpression(value)
    ? unwrap(value.getExpression())
    : undefined;
  if (callee === undefined || !Node.isIdentifier(callee)) {
    refuse(
      indexPath,
      lineOf(initializer),
      "resolvers is neither an object literal nor a call of a resolver factory.",
      "Set resolvers to an object literal, or to getResolvers(this) where getResolvers returns one.",
    );
  }
  const binding = importOf(index, callee.getText());
  const path =
    binding === undefined
      ? indexPath
      : localModule(input.files, input.dir, binding.specifier);
  if (path === undefined || !path.startsWith(`${input.dir}/`)) {
    refuse(
      indexPath,
      lineOf(initializer),
      `${callee.getText()} is imported from ${binding?.specifier}, outside this subgraph's directory.`,
      "Move the resolver factory into the subgraph's directory.",
    );
  }
  const file = sourceFile(project, input, path);
  const name = binding?.imported ?? callee.getText();
  const declaration =
    file.getFunction(name) ??
    file.getVariableDeclaration(name)?.getInitializer();
  const factory = declaration === undefined ? undefined : unwrap(declaration);
  if (
    factory === undefined ||
    !(
      Node.isFunctionDeclaration(factory) ||
      Node.isArrowFunction(factory) ||
      Node.isFunctionExpression(factory)
    )
  ) {
    refuse(
      path,
      1,
      `${path} does not declare ${name} as a function.`,
      `Declare ${name} as a function that returns an object literal.`,
    );
  }
  const body = factory.getBody();
  let returned: Node | undefined;
  if (body !== undefined && !Node.isBlock(body)) {
    returned = body;
  } else if (body !== undefined) {
    const returns = body
      .getDescendantsOfKind(SyntaxKind.ReturnStatement)
      .filter(
        (statement) =>
          statement.getFirstAncestor(
            (node) =>
              Node.isFunctionDeclaration(node) ||
              Node.isArrowFunction(node) ||
              Node.isFunctionExpression(node) ||
              Node.isMethodDeclaration(node),
          ) === factory,
      );
    if (returns.length === 1) returned = returns[0].getExpression();
  }
  const map = returned === undefined ? undefined : unwrap(returned);
  if (map === undefined || !Node.isObjectLiteralExpression(map)) {
    refuse(
      path,
      lineOf(factory),
      `${name} does not return one object literal, so its resolver coordinates cannot be read.`,
      `Make ${name} end in a single return of an object literal.`,
    );
  }
  return Object.assign(resolverTypes(map, path), { file: path });
}

export function propertyName(
  element: ObjectLiteralElementLike,
  path: string,
): string {
  if (Node.isPropertyAssignment(element) || Node.isMethodDeclaration(element)) {
    const name = element.getNameNode();
    if (Node.isIdentifier(name)) return name.getText();
    if (Node.isStringLiteral(name)) return name.getLiteralValue();
  }
  refuse(
    path,
    lineOf(element),
    Node.isSpreadAssignment(element)
      ? "The resolver map spreads another object, so its coordinates cannot be read."
      : `${element.getText().split("\n")[0]} is not a plain key of the resolver map.`,
    "Write every type and field of the resolver map as a plain key with its value.",
  );
}

function resolverTypes(
  map: ObjectLiteralExpression,
  path: string,
): Map<string, ResolverType> {
  const types = new Map<string, ResolverType>();
  for (const element of map.getProperties()) {
    const typeName = Node.isShorthandPropertyAssignment(element)
      ? element.getName()
      : propertyName(element, path);
    const value = Node.isPropertyAssignment(element)
      ? unwrap(element.getInitializerOrThrow())
      : undefined;
    if (value === undefined || !Node.isObjectLiteralExpression(value)) {
      if (OPAQUE_ROOTS.has(typeName)) {
        types.set(typeName, { line: lineOf(element), fields: new Map() });
        continue;
      }
      refuse(
        path,
        lineOf(element),
        `The resolvers of ${typeName} are not an object literal, so the conversion cannot tell which of its fields have resolvers.`,
        typeName === "Subscription"
          ? "Write Subscription's resolvers as an object literal of { subscribe, resolve? } per field."
          : `Write ${typeName}'s resolvers as an object literal with a key per field, such as ${typeName}: { field: resolver }.`,
      );
    }
    const fields = new Map<string, ResolverEntry>();
    for (const field of value.getProperties()) {
      const fieldName = Node.isShorthandPropertyAssignment(field)
        ? field.getName()
        : propertyName(field, path);
      const fieldValue = Node.isPropertyAssignment(field)
        ? unwrap(field.getInitializerOrThrow())
        : undefined;
      let hasResolve = false;
      if (typeName === "Subscription") {
        if (
          fieldValue === undefined ||
          !Node.isObjectLiteralExpression(fieldValue)
        ) {
          refuse(
            path,
            lineOf(field),
            `Subscription.${fieldName} is not an object literal with subscribe.`,
            `Write Subscription.${fieldName} as { subscribe, resolve? }.`,
          );
        }
        const steps = fieldValue
          .getProperties()
          .map((step) => propertyName(step, path));
        const unknown = steps.find(
          (step) => step !== "subscribe" && step !== "resolve",
        );
        if (unknown !== undefined || !steps.includes("subscribe")) {
          refuse(
            path,
            lineOf(field),
            unknown === undefined
              ? `Subscription.${fieldName} has no subscribe function.`
              : `Subscription.${fieldName} declares ${unknown}, which has no code-first form.`,
            `Give Subscription.${fieldName} exactly subscribe and, optionally, resolve.`,
          );
        }
        hasResolve = steps.includes("resolve");
      } else if (
        fieldValue !== undefined &&
        Node.isObjectLiteralExpression(fieldValue)
      ) {
        refuse(
          path,
          lineOf(field),
          `${typeName}.${fieldName} is a field config object, not a function.`,
          `Write ${typeName}.${fieldName} as a resolver function.`,
        );
      }
      fields.set(fieldName, { line: lineOf(field), hasResolve });
    }
    types.set(typeName, { line: lineOf(element), fields });
  }
  return types;
}
