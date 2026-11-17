/** Finds the schema-first subgraph class of index.ts and reads its members. */
import { REACTOR_API_PACKAGE } from "@powerhousedao/shared/clis";
import {
  type ClassDeclaration,
  type ClassExpression,
  Node,
  type Project,
  type PropertyDeclaration,
  type SourceFile,
  SyntaxKind,
} from "ts-morph";
import { posix } from "node:path";
import {
  importOf,
  type Input,
  lineOf,
  refuse,
  Refused,
  stringValue,
  unwrap,
} from "./context.js";

const SUBGRAPH_NAME = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

const REMOVED_FIELDS = new Set([
  "name",
  "typeDefs",
  "resolvers",
  "hasSubscriptions",
]);

export function subgraphClass(
  project: Project,
  input: Input,
  index: SourceFile,
): ClassDeclaration {
  const path = `${input.dir}/index.ts`;
  if (/\bdefineIndexSubgraph\b/.test(index.getFullText())) {
    const call = index
      .getDescendantsOfKind(SyntaxKind.Identifier)
      .find((node) => node.getText() === "defineIndexSubgraph");
    refuse(
      path,
      call === undefined ? 1 : lineOf(call),
      "The subgraph is built with defineIndexSubgraph. Its per-field readable-documents access, which wraps each query handler, has no code-first form yet.",
      "Keep this subgraph schema-first. The host serves it as it is.",
    );
  }
  const classes = index
    .getClasses()
    .filter((cls) => cls.getExtends() && cls.isExported());
  const subgraphs = classes.filter((cls) => {
    const base = unwrap(cls.getExtends()!.getExpression());
    if (!Node.isIdentifier(base)) return false;
    const binding = importOf(index, base.getText());
    return (
      binding?.specifier === REACTOR_API_PACKAGE &&
      binding.imported === "BaseSubgraph" &&
      !binding.typeOnly
    );
  });
  if (subgraphs.length === 0) {
    const other = classes.at(0);
    const found = subgraphCandidate(project, input, index);
    if (found.kind === "none") {
      throw new Refused(
        {
          file: path,
          line: 1,
          reason: "index.ts exports no subgraph class.",
          repair:
            "Name a directory that holds a subgraph, or move the helpers out of subgraphs/.",
        },
        true,
      );
    }
    if (found.kind === "outside") {
      refuse(
        path,
        lineOf(found.node),
        `index.ts exports ${found.name} from ${found.specifier}, outside ${input.dir}, so it is not converted here.`,
        "Move the subgraph class into this directory, or convert it by hand.",
      );
    }
    refuse(
      path,
      other === undefined ? 1 : lineOf(other),
      other === undefined
        ? "index.ts exports no class that extends BaseSubgraph."
        : `${other.getName() ?? "The class"} extends ${other.getExtends()!.getExpression().getText()}, not BaseSubgraph from ${REACTOR_API_PACKAGE}. Only a class that extends BaseSubgraph directly converts.`,
      "Convert the subgraph by hand, or make it extend BaseSubgraph directly.",
    );
  }
  if (subgraphs.length > 1) {
    refuse(
      path,
      lineOf(subgraphs[1]),
      "index.ts exports more than one BaseSubgraph class.",
      "Move each subgraph into its own directory under subgraphs/.",
    );
  }
  const [cls] = subgraphs;
  if (cls.getName() === undefined) {
    refuse(
      path,
      lineOf(cls),
      "The subgraph class has no name, which a code-first subgraph's builder type needs.",
      "Name the class.",
    );
  }
  if (cls.getTypeParameters().length > 0 || cls.isAbstract()) {
    refuse(
      path,
      lineOf(cls),
      "A generic or abstract subgraph class cannot become a code-first subgraph, whose builder is typed by the concrete class.",
      "Convert the subgraph by hand.",
    );
  }
  return cls;
}

/**
 * Whether `index.ts` can export a subgraph class: a class whose `extends`
 * chain reaches BaseSubgraph or a base outside the directory, or any value
 * from a relative module outside it. A directory with none of these holds
 * helpers.
 */
function subgraphCandidate(
  project: Project,
  input: Input,
  index: SourceFile,
):
  | { readonly kind: "none" | "subgraph" }
  | {
      readonly kind: "outside";
      readonly name: string;
      readonly specifier: string;
      readonly node: Node;
    } {
  for (const [path, text] of input.files) {
    if (
      path.startsWith(`${input.dir}/`) &&
      /\.[cm]?tsx?$/.test(path) &&
      project.getSourceFile(`/${path}`) === undefined
    ) {
      project.createSourceFile(`/${path}`, text);
    }
  }
  const outside = (file: SourceFile, specifier: string) => {
    if (!specifier.startsWith(".")) return false;
    const target = posix
      .join(file.getDirectory().getPath(), specifier)
      .replace(/\.[cm]?jsx?$/, "");
    return [".ts", ".tsx", ".mts", "/index.ts"].every(
      (suffix) => project.getSourceFile(`${target}${suffix}`) === undefined,
    );
  };
  for (const declaration of index.getExportDeclarations()) {
    const specifier = declaration.getModuleSpecifierValue();
    const names = declaration.getNamedExports();
    if (specifier !== undefined) {
      if (outside(index, specifier)) {
        return {
          kind: "outside",
          name: names.map((named) => named.getName()).join(", ") || "*",
          specifier,
          node: declaration,
        };
      }
      continue;
    }
    for (const named of names) {
      const binding = importOf(index, named.getName());
      if (binding !== undefined && outside(index, binding.specifier)) {
        return {
          kind: "outside",
          name: named.getName(),
          specifier: binding.specifier,
          node: named,
        };
      }
    }
  }
  const reachesSubgraph = (
    cls: ClassDeclaration | ClassExpression,
    seen: Set<Node>,
  ): boolean => {
    const extended = cls.getExtends();
    if (extended === undefined || seen.has(cls)) return false;
    seen.add(cls);
    if (extended.getExpression().getText().includes("BaseSubgraph")) {
      return true;
    }
    const base = cls.getBaseClass();
    if (base !== undefined) return reachesSubgraph(base, seen);
    const expression = unwrap(extended.getExpression());
    const binding = Node.isIdentifier(expression)
      ? importOf(cls.getSourceFile(), expression.getText())
      : undefined;
    return (
      binding !== undefined && outside(cls.getSourceFile(), binding.specifier)
    );
  };
  const classes = [...index.getExportedDeclarations().values()]
    .flat()
    .flatMap((node) => {
      if (Node.isClassDeclaration(node) || Node.isClassExpression(node)) {
        return [node];
      }
      const initializer = Node.isVariableDeclaration(node)
        ? node.getInitializer()
        : undefined;
      return initializer !== undefined && Node.isClassExpression(initializer)
        ? [initializer]
        : [];
    });
  return classes.some((cls) => reachesSubgraph(cls, new Set()))
    ? { kind: "subgraph" }
    : { kind: "none" };
}

export type Members = {
  readonly name: string;
  readonly typeDefs: Node;
  /** Absent once the resolvers are the class's members. */
  readonly resolvers: PropertyDeclaration | undefined;
  readonly hasSubscriptions: boolean;
  readonly hasSubscriptionsLine: number;
  readonly removed: readonly PropertyDeclaration[];
};

export function classMembers(
  cls: ClassDeclaration,
  path: string,
  inlined = false,
): Members {
  const fields = new Map<string, PropertyDeclaration>();
  for (const member of cls.getMembers()) {
    const name = Node.hasName(member) ? member.getName() : undefined;
    if (name === undefined) continue;
    const isStatic = Node.isStaticable(member) && member.isStatic();
    if (isStatic && (name === "subgraphName" || name === "getSchema")) {
      refuse(
        path,
        lineOf(member),
        `The class already declares static ${name}, which a code-first subgraph uses for its own purpose.`,
        `Rename static ${name}.`,
      );
    }
    if (isStatic) continue;
    if (name === "path") {
      refuse(
        path,
        lineOf(member),
        "The class sets path, which the host injects and a code-first subgraph cannot set.",
        "Remove the path field.",
      );
    }
    if (!REMOVED_FIELDS.has(name)) continue;
    if (!Node.isPropertyDeclaration(member)) {
      refuse(
        path,
        lineOf(member),
        `${name} is not a field with an initializer.`,
        `Declare ${name} as a field initialized with its value.`,
      );
    }
    fields.set(name, member);
  }
  for (const assignment of cls.getDescendantsOfKind(
    SyntaxKind.BinaryExpression,
  )) {
    const left = unwrap(assignment.getLeft());
    if (
      assignment.getOperatorToken().getKind() === SyntaxKind.EqualsToken &&
      Node.isPropertyAccessExpression(left) &&
      left.getExpression().getKind() === SyntaxKind.ThisKeyword &&
      REMOVED_FIELDS.has(left.getName())
    ) {
      refuse(
        path,
        lineOf(assignment),
        `The class assigns this.${left.getName()}. A code-first subgraph's ${left.getName()} comes from getSchema, and the host refuses an instance that changes it.`,
        `Remove the assignment to this.${left.getName()}.`,
      );
    }
  }
  const required = (field: string) => {
    const member = fields.get(field);
    const initializer = member?.getInitializer();
    if (member === undefined || initializer === undefined) {
      refuse(
        path,
        lineOf(member ?? cls),
        `The class has no ${field} field with an initializer.`,
        `Initialize ${field} in the class body.`,
      );
    }
    return { member, initializer };
  };
  const nameField = required("name");
  const name = stringValue(nameField.initializer);
  if (name === undefined) {
    refuse(
      path,
      lineOf(nameField.member),
      "name is not a string literal, so its route cannot be known.",
      "Set name to a string literal.",
    );
  }
  if (!SUBGRAPH_NAME.test(name)) {
    refuse(
      path,
      lineOf(nameField.member),
      `The subgraph name ${JSON.stringify(name)} is not lowercase kebab-case. A code-first subgraphName must be, and renaming it would move the route.`,
      "Keep this subgraph schema-first, or rename it to lowercase kebab-case first and update its clients.",
    );
  }
  const typeDefs = required("typeDefs");
  const resolvers = inlined ? undefined : required("resolvers");
  const subscriptions = fields.get("hasSubscriptions");
  let hasSubscriptions = false;
  if (subscriptions !== undefined) {
    const value = subscriptions.getInitializer();
    const kind = value === undefined ? undefined : unwrap(value).getKind();
    if (kind !== SyntaxKind.TrueKeyword && kind !== SyntaxKind.FalseKeyword) {
      refuse(
        path,
        lineOf(subscriptions),
        "hasSubscriptions is not true or false.",
        "Initialize hasSubscriptions with true or false.",
      );
    }
    hasSubscriptions = kind === SyntaxKind.TrueKeyword;
  }
  return {
    name,
    typeDefs: typeDefs.initializer,
    resolvers: resolvers?.member,
    hasSubscriptions,
    hasSubscriptionsLine: lineOf(subscriptions ?? nameField.member),
    removed: [...fields.values()],
  };
}
