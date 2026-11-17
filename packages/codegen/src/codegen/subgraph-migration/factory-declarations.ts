/** What a resolver factory declares before its map, and what each declaration becomes in the class. */
import {
  type ClassDeclaration,
  Node,
  type PropertyDeclaration,
  type SourceFile,
  SyntaxKind,
  type TypeChecker,
  type VariableDeclaration,
  VariableDeclarationKind,
  type VoidExpression,
} from "ts-morph";
import { callFrameOwner, freeName } from "../migration-ast.js";
import { lineOf, refuse, unwrap } from "./context.js";
import { RESERVED_GLOBALS } from "./reserved-globals.js";
import type { FunctionLike, ResolverFactory } from "./resolver-factory.js";
import { isReference, localBindings } from "./source-imports.js";

/** What a declaration of the factory, or its parameter, becomes. */
type Target =
  | { readonly kind: "this" }
  | { readonly kind: "member"; readonly name: string }
  | { readonly kind: "module"; readonly name: string };

/** A declaration of the factory, before its map. */
type Declared = {
  readonly node: Node;
  readonly statement: Node;
  readonly name: string;
  readonly kind: "value" | "function" | "type";
  readonly mutable: boolean;
};

/**
 * The names the converted code has taken so far: the class's members, and
 * the module-level names of index.ts and the factory's file.
 */
export type Names = {
  readonly members: Set<string>;
  readonly module: Set<string>;
};

/** The field the factory's parameter becomes, typed as the parameter is. */
export type ParamField = {
  readonly name: string;
  readonly type?: Node;
  readonly value: string;
};

/** What the factory's parameter becomes, and the code that now reads it. */
type Parameter = {
  readonly target?: Target;
  readonly field?: ParamField;
  readonly text: string;
};

/** Each identifier under `root` that names a declaration of the factory or its parameter. */
type References = (
  root: Node,
) => { readonly identifier: Node; readonly target: Node }[];

/** A node's text in the factory's file, each reference renamed to what its declaration became. */
export type TextOf = (node: Node, from?: number, receiver?: string) => string;

/** A function that has its own `this`, unlike an arrow function. */
export const ownsThis = (node: Node) =>
  Node.isFunctionExpression(node) ||
  Node.isFunctionDeclaration(node) ||
  Node.isMethodDeclaration(node) ||
  Node.isConstructorDeclaration(node) ||
  Node.isGetAccessorDeclaration(node) ||
  Node.isSetAccessorDeclaration(node) ||
  Node.isClassDeclaration(node) ||
  Node.isClassExpression(node);

const isLiteral = (node: Node) =>
  Node.isStringLiteral(node) ||
  Node.isNoSubstitutionTemplateLiteral(node) ||
  Node.isNumericLiteral(node) ||
  node.getKind() === SyntaxKind.TrueKeyword ||
  node.getKind() === SyntaxKind.FalseKeyword ||
  node.getKind() === SyntaxKind.NullKeyword;

export function takenNames(
  index: SourceFile,
  cls: ClassDeclaration,
  member: PropertyDeclaration,
  file: SourceFile,
): Names {
  return {
    members: new Set(
      cls
        .getMembers()
        .flatMap((candidate) =>
          candidate === member || !Node.hasName(candidate)
            ? []
            : [candidate.getName()],
        ),
    ),
    // A module-level name must not clash with index.ts, with what the
    // factory's file declares or imports, or with a global the code reads.
    module: new Set([
      ...localBindings(index).keys(),
      ...(file === index ? [] : localBindings(file).keys()),
    ]),
  };
}

export function takeMemberName(names: Names, wanted: string): string {
  const name = freeName(names.members, wanted);
  names.members.add(name);
  return name;
}

function takeModuleName(
  names: Names,
  wanted: string,
  used: ReadonlySet<string>,
): string {
  const name = freeName(
    {
      has: (candidate) =>
        names.module.has(candidate) ||
        RESERVED_GLOBALS.has(candidate) ||
        (candidate !== wanted && used.has(candidate)),
    },
    wanted,
  );
  names.module.add(name);
  return name;
}

/**
 * The parameter is the subgraph when index.ts passes `this`. Any other
 * argument becomes a field the class computes as it is constructed, as
 * index.ts computed it before.
 */
export function parameterOf(located: ResolverFactory, names: Names): Parameter {
  const { param, argument } = located;
  if (param === undefined) return { text: "this" };
  if (
    argument === undefined ||
    unwrap(argument).getKind() === SyntaxKind.ThisKeyword
  ) {
    return { target: { kind: "this" }, text: "this" };
  }
  const name = takeMemberName(names, `#${param.getName()}`);
  return {
    target: { kind: "member", name },
    field: {
      name,
      ...(param.getTypeNode() && { type: param.getTypeNode() }),
      value: argument.getText(),
    },
    text: `this.${name}`,
  };
}

/** The factory's declarations before its map; a statement a class cannot hold is refused. */
export function factoryDeclarations(
  located: ResolverFactory,
  filePath: string,
): Declared[] {
  const { factory, param, preamble } = located;
  const declared: Declared[] = [];
  for (const statement of preamble) {
    if (Node.isVariableStatement(statement)) {
      const mutable =
        statement.getDeclarationKind() !== VariableDeclarationKind.Const;
      for (const declaration of statement.getDeclarations()) {
        const nameNode = declaration.getNameNode();
        if (Node.isIdentifier(nameNode)) {
          const initializer = declaration.getInitializer();
          const value =
            initializer === undefined ? undefined : unwrap(initializer);
          declared.push({
            node: declaration,
            statement,
            name: nameNode.getText(),
            kind:
              value !== undefined &&
              !mutable &&
              (Node.isArrowFunction(value) || Node.isFunctionExpression(value))
                ? "function"
                : "value",
            mutable,
          });
          continue;
        }
        const source = declaration.getInitializer();
        const fromParam =
          source !== undefined &&
          param !== undefined &&
          Node.isIdentifier(unwrap(source)) &&
          unwrap(source).getText() === param.getName();
        if (
          !Node.isObjectBindingPattern(nameNode) ||
          !fromParam ||
          nameNode
            .getElements()
            .some(
              (element) =>
                element.getDotDotDotToken() !== undefined ||
                element.getInitializer() !== undefined ||
                !Node.isIdentifier(element.getNameNode()),
            )
        ) {
          refuse(
            filePath,
            lineOf(declaration),
            `${factory.name} destructures ${declaration.getNameNode().getText()} in a way a class field cannot hold.`,
            `Declare each value with its own const, such as const reactorClient = ${param?.getName() ?? "subgraph"}.reactorClient.`,
          );
        }
        for (const element of nameNode.getElements()) {
          declared.push({
            node: element,
            statement,
            name: element.getName(),
            kind: "value",
            mutable,
          });
        }
      }
    } else if (Node.isFunctionDeclaration(statement)) {
      const name = statement.getName();
      if (name === undefined || statement.isGenerator()) {
        refuse(
          filePath,
          lineOf(statement),
          `${factory.name} declares a ${name === undefined ? "nameless" : "generator"} function before its resolvers.`,
          "Declare it as a named function, or move it out of the factory.",
        );
      }
      declared.push({
        node: statement,
        statement,
        name,
        kind: "function",
        mutable: false,
      });
    } else if (
      Node.isTypeAliasDeclaration(statement) ||
      Node.isInterfaceDeclaration(statement)
    ) {
      declared.push({
        node: statement,
        statement,
        name: statement.getName(),
        kind: "type",
        mutable: false,
      });
    } else if (
      Node.isExpressionStatement(statement) &&
      Node.isVoidExpression(statement.getExpression()) &&
      Node.isIdentifier(
        (statement.getExpression() as VoidExpression).getExpression(),
      )
    ) {
      // `void subgraph;` only marks the parameter as read.
      continue;
    } else {
      refuse(
        filePath,
        lineOf(statement),
        `${factory.name} runs ${statement.getText().split("\n")[0]} before it returns its resolvers; a code-first subgraph has no place to run it as it is constructed.`,
        "Move the statement into onSetup, or into the resolvers that need it.",
      );
    }
  }
  return declared;
}

/** Finds the references to `declarations`, by the checker's symbols. */
export function factoryReferences(
  checker: TypeChecker,
  declarations: readonly Node[],
): References {
  const bySource = new Map<unknown, Node>(
    declarations.map((node) => [node.compilerNode, node]),
  );
  const declarationOf = (identifier: Node): Node | undefined => {
    const parent = identifier.getParent();
    const symbol =
      parent !== undefined && Node.isShorthandPropertyAssignment(parent)
        ? checker.compilerObject.getShorthandAssignmentValueSymbol(
            parent.compilerNode,
          )
        : identifier.getSymbol()?.compilerSymbol;
    for (const declaration of symbol?.getDeclarations() ?? []) {
      const node = bySource.get(declaration);
      if (node !== undefined) return node;
    }
    return undefined;
  };
  return (root) =>
    root
      .getDescendantsOfKind(SyntaxKind.Identifier)
      .filter(isReference)
      .flatMap((identifier) => {
        const target = declarationOf(identifier);
        return target === undefined ? [] : [{ identifier, target }];
      });
}

const nameNodeOf = (node: Node) =>
  (node as { getNameNode?: () => Node }).getNameNode?.();

/**
 * Keeps unread property reads: a getter can initialize state even when its
 * result is discarded. Only an unused copy of the parameter can be dropped.
 */
export function retainedDeclarations(
  located: ResolverFactory,
  declared: readonly Declared[],
  references: References,
): {
  readonly declared: readonly Declared[];
  readonly effects: ReadonlySet<Node>;
} {
  const { factory, map, param, preamble } = located;
  const voids = new Set(
    preamble.filter(
      (statement) =>
        Node.isExpressionStatement(statement) &&
        Node.isVoidExpression(statement.getExpression()),
    ),
  );
  const read = new Set(
    references(factory.node ?? map)
      .filter(
        ({ identifier, target }) =>
          identifier !== nameNodeOf(target) &&
          !voids.has(
            identifier.getFirstAncestorByKind(SyntaxKind.ExpressionStatement) ??
              identifier,
          ),
      )
      .map(({ target }) => target),
  );
  const readsOnlyParam = (node: Node | undefined): boolean => {
    if (node === undefined || param === undefined) return false;
    const value = unwrap(node);
    if (Node.isIdentifier(value)) return value.getText() === param.getName();
    return (
      Node.isPropertyAccessExpression(value) &&
      readsOnlyParam(value.getExpression())
    );
  };
  const effects = new Set<Node>();
  const kept = declared.filter((entry) => {
    if (entry.kind !== "value" || read.has(entry.node)) return true;
    if (Node.isBindingElement(entry.node)) {
      effects.add(entry.node);
      return true;
    }
    if (!Node.isVariableDeclaration(entry.node)) return true;
    const initializer = entry.node.getInitializer();
    if (!readsOnlyParam(initializer)) return true;
    if (initializer !== undefined && Node.isIdentifier(unwrap(initializer)))
      return false;
    effects.add(entry.node);
    return true;
  });
  return { declared: kept, effects };
}

/**
 * The declarations that need the instance: the parameter, every value but
 * a literal constant, and every function (each construction ran the factory
 * once and created new function identities). A type goes to module level, where the
 * subgraph and its values are not, so a type that reads one is refused.
 */
export function instanceDeclarations(
  located: ResolverFactory,
  declared: readonly Declared[],
  references: References,
  filePath: string,
): ReadonlySet<Node> {
  const { param } = located;
  const onInstance = new Set<Node>(param === undefined ? [] : [param]);
  for (const entry of declared) {
    if (entry.kind === "function") {
      onInstance.add(entry.node);
      continue;
    }
    if (entry.kind !== "value") continue;
    const initializer = Node.isVariableDeclaration(entry.node)
      ? entry.node.getInitializer()
      : undefined;
    if (
      !entry.mutable &&
      initializer !== undefined &&
      isLiteral(unwrap(initializer))
    ) {
      continue;
    }
    onInstance.add(entry.node);
  }
  for (const entry of declared) {
    const type =
      entry.kind === "type"
        ? entry.node
        : Node.isVariableDeclaration(entry.node)
          ? entry.node.getTypeNode()
          : undefined;
    if (type === undefined) continue;
    const read = references(type).find(({ target }) => onInstance.has(target));
    if (read !== undefined) {
      refuse(
        filePath,
        lineOf(read.identifier),
        `The type ${entry.kind === "type" ? "" : "of "}${entry.name} reads ${read.identifier.getText()}, which is part of the subgraph once the resolvers are its members, so the type has nowhere to go.`,
        `Spell ${entry.name} without ${read.identifier.getText()}, or declare it outside the resolver factory.`,
      );
    }
  }
  return onInstance;
}

/** Where each declaration goes: a private member when it needs the instance, else module level. */
export function declarationTargets(
  located: ResolverFactory,
  parameter: Parameter,
  declared: readonly Declared[],
  onInstance: ReadonlySet<Node>,
  names: Names,
): ReadonlyMap<Node, Target> {
  const targets = new Map<Node, Target>();
  const used = new Set(
    (located.factory.node ?? located.map)
      .getDescendantsOfKind(SyntaxKind.Identifier)
      .map((identifier) => identifier.compilerNode.text),
  );
  if (located.param !== undefined && parameter.target !== undefined) {
    targets.set(located.param, parameter.target);
  }
  for (const entry of declared) {
    targets.set(
      entry.node,
      onInstance.has(entry.node)
        ? { kind: "member", name: takeMemberName(names, `#${entry.name}`) }
        : { kind: "module", name: takeModuleName(names, entry.name, used) },
    );
  }
  return targets;
}

/**
 * The functions whose `this` becomes the subgraph: the resolvers that are
 * not arrow functions, the factory's function declarations and, for a
 * factory that is not an arrow function, the factory itself. Refuses a
 * `this` or `arguments` that would name something else once the code is a
 * class member.
 */
export function instanceThisOwners(
  located: ResolverFactory,
  declared: readonly Declared[],
  onInstance: ReadonlySet<Node>,
  filePath: string,
): ReadonlySet<Node> {
  const { factory, map } = located;
  const resolverFunctions = new Set<Node>();
  for (const typeEntry of map.getProperties()) {
    const typeValue = Node.isPropertyAssignment(typeEntry)
      ? unwrap(typeEntry.getInitializerOrThrow())
      : undefined;
    if (typeValue === undefined || !Node.isObjectLiteralExpression(typeValue)) {
      continue;
    }
    for (const fieldEntry of typeValue.getProperties()) {
      const value = Node.isPropertyAssignment(fieldEntry)
        ? unwrap(fieldEntry.getInitializerOrThrow())
        : fieldEntry;
      const candidates = Node.isObjectLiteralExpression(value)
        ? value
            .getProperties()
            .map((step) =>
              Node.isPropertyAssignment(step)
                ? unwrap(step.getInitializerOrThrow())
                : step,
            )
        : [value];
      for (const candidate of candidates) {
        if (ownsThis(candidate)) resolverFunctions.add(candidate);
      }
    }
  }
  // `this` in the factory, or in a resolver with its own `this`, names
  // something else than the subgraph once the code is a class member.
  for (const keyword of (factory.node ?? map).getDescendantsOfKind(
    SyntaxKind.ThisKeyword,
  )) {
    const owner = callFrameOwner(keyword);
    if (
      (factory.node !== undefined &&
        (owner === undefined || owner === factory.node)) ||
      (owner !== undefined && resolverFunctions.has(owner))
    ) {
      refuse(
        filePath,
        lineOf(keyword),
        "The resolvers read this, which names the subgraph once they are its methods, and something else before.",
        "Read the subgraph through the factory's parameter instead of this.",
      );
    }
  }
  // Dynamic receiver and frame reads remain unsupported for factory helpers.
  for (const entry of declared) {
    const initializer = Node.isVariableDeclaration(entry.node)
      ? entry.node.getInitializer()
      : undefined;
    const value = initializer === undefined ? undefined : unwrap(initializer);
    const fn = Node.isFunctionDeclaration(entry.node)
      ? entry.node
      : value !== undefined && Node.isFunctionExpression(value)
        ? value
        : undefined;
    if (fn === undefined || !onInstance.has(entry.node)) continue;
    const own = [
      ...fn.getDescendantsOfKind(SyntaxKind.ThisKeyword),
      ...fn
        .getDescendantsOfKind(SyntaxKind.Identifier)
        .filter((identifier) => identifier.getText() === "arguments"),
    ].find((node) => callFrameOwner(node) === fn);
    if (own !== undefined) {
      refuse(
        filePath,
        lineOf(own),
        `${entry.name} reads ${own.getText()}, so its original call frame must be kept outside the migrated factory.`,
        `Write ${entry.name} without ${own.getText()}.`,
      );
    }
  }
  return new Set<Node>([
    ...resolverFunctions,
    ...declared.flatMap((entry) =>
      Node.isFunctionDeclaration(entry.node) ? [entry.node] : [],
    ),
    ...(factory.node !== undefined && ownsThis(factory.node)
      ? [factory.node]
      : []),
  ]);
}

/**
 * The factory file's text with each reference to a declaration renamed to
 * what it became. A reference on the instance from a nested function with
 * its own `this` is refused, as that function cannot reach the subgraph.
 */
export function rewrittenText(
  located: ResolverFactory,
  declared: readonly Declared[],
  targets: ReadonlyMap<Node, Target>,
  references: References,
  instanceOwners: ReadonlySet<Node>,
  filePath: string,
): TextOf {
  const { file, factory, map } = located;
  const edits: {
    start: number;
    end: number;
    text: (receiver: string) => string;
    /** For a shorthand property, what its name alone now reads. */
    value?: (receiver: string) => string;
  }[] = [];
  for (const entry of declared) {
    const to = targets.get(entry.node)!;
    const nameNode = nameNodeOf(entry.node);
    if (
      to.kind === "module" &&
      to.name !== entry.name &&
      nameNode !== undefined
    ) {
      edits.push({
        start: nameNode.getStart(),
        end: nameNode.getEnd(),
        text: () => to.name,
      });
    }
  }
  for (const { identifier, target } of references(factory.node ?? map)) {
    if (identifier === nameNodeOf(target)) continue;
    const to = targets.get(target);
    // A dropped value's only reads are in the `void` statements that go too.
    if (to === undefined) continue;
    const replacement = (receiver: string) =>
      to.kind === "this"
        ? receiver
        : to.kind === "member"
          ? `${receiver}.${to.name}`
          : to.name;
    if (to.kind !== "module") {
      // A field initializer's `this` is the subgraph; so is the `this` of
      // what becomes a method or an arrow field. Any other function with
      // its own `this` would read something else.
      const owner = callFrameOwner(identifier);
      if (
        Node.isFunctionExpression(owner) &&
        (owner.getNameNode()?.findReferencesAsNodes().length ?? 0) > 0
      ) {
        refuse(
          filePath,
          lineOf(identifier),
          `${owner.getName()} references its own function while capturing ${identifier.getText()}, which would become an instance read without a stable receiver.`,
          "Move the recursive function outside the resolver factory and pass its captured values as explicit parameters.",
        );
      }
      if (
        owner !== undefined &&
        owner !== factory.node &&
        owner.getAncestors().includes(factory.node ?? map) &&
        !instanceOwners.has(owner)
      ) {
        refuse(
          filePath,
          lineOf(identifier),
          `${identifier.getText()} is read inside a nested function with its own this, which cannot reach the subgraph once the resolvers are its methods.`,
          "Make that function an arrow function.",
        );
      }
    }
    const parent = identifier.getParent();
    if (Node.isShorthandPropertyAssignment(parent)) {
      edits.push({
        start: parent.getStart(),
        end: parent.getEnd(),
        text: (receiver) => `${identifier.getText()}: ${replacement(receiver)}`,
        value: replacement,
      });
    } else if (replacement("this") !== identifier.getText()) {
      edits.push({
        start: identifier.getStart(),
        end: identifier.getEnd(),
        text: replacement,
      });
    }
  }
  return (node, from = node.getStart(), receiver = "this") => {
    const end = node.getEnd();
    const own = edits.find(
      (edit) =>
        edit.value !== undefined && edit.start === from && edit.end === end,
    );
    if (own?.value !== undefined) return own.value(receiver);
    let text = file.getFullText().slice(from, end);
    for (const edit of edits
      .filter((candidate) => candidate.start >= from && candidate.end <= end)
      .sort((left, right) => right.start - left.start)) {
      text =
        text.slice(0, edit.start - from) +
        edit.text(receiver) +
        text.slice(edit.end - from);
    }
    return text;
  };
}

/** `text` under the comments that lead `node`. */
export function withComments(node: Node, text: string): string {
  const comments = node
    .getLeadingCommentRanges()
    .map((range) => range.getText())
    .join("\n");
  return comments === "" ? text : `${comments}\n${text}`;
}

function functionParts(textOf: TextOf, fn: FunctionLike) {
  const typeParameters = fn.getTypeParameters().map((node) => textOf(node));
  const returnType = fn.getReturnTypeNode();
  const body = fn.getBody();
  return {
    async: fn.isAsync() ? "async " : "",
    generator: !Node.isArrowFunction(fn) && fn.isGenerator() ? "*" : "",
    typeParameters:
      typeParameters.length === 0 ? "" : `<${typeParameters.join(", ")}>`,
    parameters: fn
      .getParameters()
      .map((node) => textOf(node))
      .join(", "),
    returnType: returnType === undefined ? "" : `: ${textOf(returnType)}`,
    block:
      body === undefined
        ? "{}"
        : Node.isBlock(body)
          ? textOf(body)
          : `{\nreturn ${textOf(body)};\n}`,
  };
}

export function methodText(
  textOf: TextOf,
  name: string,
  fn: FunctionLike,
): string {
  const parts = functionParts(textOf, fn);
  return `${parts.async}${parts.generator}${name}${parts.typeParameters}(${parts.parameters})${parts.returnType} ${parts.block}`;
}

/** The type annotation of a declaration, with its colon, or nothing. */
function typeAnnotation(
  declaration: VariableDeclaration,
  textOf: TextOf,
): string {
  const type = declaration.getTypeNode();
  return type === undefined ? "" : `: ${textOf(type)}`;
}

/** The factory's declarations as class fields, and as module-level statements. */
export function declarationMembers(
  declared: readonly Declared[],
  targets: ReadonlyMap<Node, Target>,
  textOf: TextOf,
  parameter: Parameter,
): {
  readonly fields: readonly string[];
  /** Function declarations, which the factory could call before declaring them. */
  readonly functionFields: readonly string[];
  readonly hoisted: readonly string[];
} {
  const fields: string[] = [];
  const functionFields: string[] = [];
  const hoisted: string[] = [];
  for (const entry of declared) {
    const to = targets.get(entry.node)!;
    if (to.kind === "module") {
      const statement = entry.statement;
      const own =
        Node.isVariableStatement(statement) &&
        statement.getDeclarations().length > 1;
      if (own && Node.isVariableDeclaration(entry.node)) {
        hoisted.push(
          `const ${to.name}${typeAnnotation(entry.node, textOf)} = ${textOf(entry.node.getInitializerOrThrow())};`,
        );
      } else {
        hoisted.push(withComments(statement, textOf(statement)));
      }
      continue;
    }
    if (to.kind !== "member") continue;
    const modifier = entry.mutable ? "" : "readonly ";
    let value: string;
    let type = "";
    if (Node.isBindingElement(entry.node)) {
      const property =
        entry.node.getPropertyNameNode()?.getText() ?? entry.node.getName();
      value = `${parameter.text}.${property}`;
    } else if (Node.isFunctionDeclaration(entry.node)) {
      const receiver = freeName(
        new Set([
          ...entry.node
            .getDescendantsOfKind(SyntaxKind.Identifier)
            .map((node) => node.compilerNode.text),
          ...[...targets.values()].flatMap((target) =>
            target.kind === "module" ? [target.name] : [],
          ),
        ]),
        "subgraph",
      );
      value = `(() => { const ${receiver} = this; return ${textOf(entry.node, entry.node.getStart(), receiver)}; })()`;
    } else {
      const declaration = entry.node as VariableDeclaration;
      type = typeAnnotation(declaration, textOf);
      const initializer = declaration.getInitializer();
      value = initializer === undefined ? "" : textOf(initializer);
      if (
        initializer !== undefined &&
        (Node.isArrowFunction(unwrap(initializer)) ||
          Node.isFunctionExpression(unwrap(initializer)))
      ) {
        const key = JSON.stringify(declaration.getSymbolOrThrow().getName());
        const context = type === "" ? "" : ` satisfies { [${key}]${type} }`;
        value = `({ [${key}]: ${value} }${context})[${key}]`;
      }
    }
    // The statement's comments go with its first declaration.
    const first = Node.isVariableStatement(entry.statement)
      ? entry.statement.getDeclarations()[0]
      : entry.statement;
    const text = `${modifier}${to.name}${type}${value === "" ? "" : ` = ${value}`};`;
    (Node.isFunctionDeclaration(entry.node) ? functionFields : fields).push(
      first === entry.node ||
        entry.statement === entry.node ||
        (Node.isBindingElement(entry.node) &&
          Node.isVariableStatement(entry.statement) &&
          entry.node.getFirstAncestorByKind(SyntaxKind.VariableDeclaration) ===
            first &&
          entry.node.getChildIndex() === 0)
        ? withComments(entry.statement, text)
        : text,
    );
  }
  return { fields, functionFields, hoisted };
}
