/** The resolvers of the schema-first map as members of the subgraph class, and how getSchema calls each. */
import { camelCase, pascalCase } from "change-case";
import { callFrameOwner, stableArrow } from "../migration-ast.js";
import {
  type ArrowFunction,
  type FunctionExpression,
  type MethodDeclaration,
  Node,
  type ObjectLiteralElementLike,
  type ObjectLiteralExpression,
  SyntaxKind,
  type Type,
} from "ts-morph";
import { isRootName, lineOf, refuse, unwrap } from "./context.js";
import {
  methodText,
  type Names,
  takeMemberName,
  type TextOf,
  withComments,
} from "./factory-declarations.js";
import type { FunctionLike } from "./resolver-factory.js";
import { propertyName } from "./resolver-map.js";

/** The names getSchema and each entry's callback bind. */
const CALLBACK_NAMES = new Set([
  "schema",
  "parent",
  "args",
  "request",
  "info",
  "value",
  "subgraph",
]);

/** How `getSchema` reaches one resolver of the schema-first map. */
export type ResolverCall = {
  /**
   * What the entry calls: `subgraph.#builders` or a module-level function.
   */
  readonly callee: string;
  /** How many arguments the resolver declares; undefined passes them all. */
  readonly arity: number | undefined;
};

type ResolverMembers = {
  /**
   * Each resolver by coordinate: `Query.builders`,
   * `SOW_Progress.__resolveType`, `Subscription.onTick.subscribe`.
   */
  readonly calls: ReadonlyMap<string, ResolverCall>;
  readonly methods: readonly string[];
  /** The first method the resolvers became, which `getSchema` goes before. */
  readonly firstMethod: string | undefined;
  readonly fields: readonly string[];
};

/** One resolver as a member, or as a value called where it is declared. */
type ResolverMember = {
  readonly call: ResolverCall;
  readonly method?: { readonly name: string; readonly text: string };
  readonly field?: string;
};

/**
 * Each resolver of `map` as a member of the class: an arrow field or a
 * method for one written in the map, a field for another expression, and a
 * field holding a Query or Mutation built elsewhere.
 */
export function resolverMembers(
  map: ObjectLiteralExpression,
  filePath: string,
  names: Names,
  textOf: TextOf,
): ResolverMembers {
  const calls = new Map<string, ResolverCall>();
  const methods: string[] = [];
  const fields: string[] = [];
  let firstMethod: string | undefined;
  const add = (
    coordinate: string,
    wanted: readonly string[],
    value: Node,
    holder: Node,
  ) => {
    const member = resolverMember(
      { map, filePath, names, textOf },
      coordinate,
      wanted,
      value,
      holder,
    );
    if (member.method !== undefined) {
      firstMethod ??= member.method.name;
      methods.push(member.method.text);
    }
    if (member.field !== undefined) fields.push(member.field);
    calls.set(coordinate, member.call);
  };
  for (const typeEntry of map.getProperties()) {
    const typeName = Node.isShorthandPropertyAssignment(typeEntry)
      ? typeEntry.getName()
      : propertyName(typeEntry, filePath);
    const typeValue = Node.isPropertyAssignment(typeEntry)
      ? unwrap(typeEntry.getInitializerOrThrow())
      : typeEntry;
    if (!Node.isObjectLiteralExpression(typeValue)) {
      refuseBuiltRoot(typeEntry, typeName, typeValue, filePath);
    }
    for (const fieldEntry of typeValue.getProperties()) {
      const fieldName = Node.isShorthandPropertyAssignment(fieldEntry)
        ? fieldEntry.getName()
        : propertyName(fieldEntry, filePath);
      const value = Node.isPropertyAssignment(fieldEntry)
        ? fieldEntry.getInitializerOrThrow()
        : Node.isShorthandPropertyAssignment(fieldEntry)
          ? fieldEntry.getNameNode()
          : fieldEntry;
      const coordinate = `${typeName}.${fieldName}`;
      if (fieldName === "__resolveType") {
        add(
          coordinate,
          [`resolve${pascalCase(typeName)}Type`],
          value,
          fieldEntry,
        );
      } else if (typeName === "Subscription") {
        const steps = unwrap(value);
        if (!Node.isObjectLiteralExpression(steps)) continue;
        for (const step of steps.getProperties()) {
          const stepName = propertyName(step, filePath);
          add(
            `${coordinate}.${stepName}`,
            [
              `${fieldName}${pascalCase(stepName)}`,
              `subscription${pascalCase(fieldName)}${pascalCase(stepName)}`,
            ],
            Node.isPropertyAssignment(step)
              ? step.getInitializerOrThrow()
              : step,
            step,
          );
        }
      } else {
        const qualified = `${camelCase(typeName)}${pascalCase(fieldName)}`;
        add(
          coordinate,
          isRootName(typeName) ? [fieldName, qualified] : [qualified],
          value,
          fieldEntry,
        );
      }
    }
  }
  return { calls, methods, firstMethod, fields };
}

/** The first of `wanted` no member has, or the last one numbered. */
function memberName(names: Names, wanted: readonly string[]): string {
  const open = wanted
    .map((name) => `#${name}`)
    .find((name) => !names.members.has(name));
  return takeMemberName(names, open ?? `#${wanted.at(-1)}`);
}

/** A code-first resolveType passes value, request and info, not abstractType. */
function checkResolveType(
  map: ObjectLiteralExpression,
  filePath: string,
  coordinate: string,
  count: number | undefined,
) {
  if (!coordinate.endsWith(".__resolveType")) return;
  if (count !== undefined && count <= 3) return;
  refuse(
    filePath,
    lineOf(map),
    `${coordinate} may read its fourth parameter, abstractType, which a code-first resolveType does not receive.`,
    `Write ${coordinate} directly in the resolver map with at most value, context and info; it must not read abstractType.`,
  );
}

function resolverMember(
  scope: {
    readonly map: ObjectLiteralExpression;
    readonly filePath: string;
    readonly names: Names;
    readonly textOf: TextOf;
  },
  coordinate: string,
  wanted: readonly string[],
  value: Node,
  holder: Node,
): ResolverMember {
  const { map, filePath, names, textOf } = scope;
  const node = unwrap(value);
  if (
    Node.isArrowFunction(node) ||
    Node.isFunctionExpression(node) ||
    Node.isMethodDeclaration(node)
  ) {
    checkResolveType(map, filePath, coordinate, arityOf(node));
    const contextual =
      ((Node.isArrowFunction(node) || Node.isFunctionExpression(node)) &&
        node.getContextualType() !== undefined) ||
      node
        .getAncestors()
        .some(
          (ancestor) =>
            Node.isObjectLiteralExpression(ancestor) &&
            ancestor.getContextualType() !== undefined,
        );
    // Parameter and yield types come from the resolver's own contextual
    // type; an absent, any or unknown one gives none to lose. `this` changes
    // meaning in a class member whatever the context.
    const typedByContext =
      node
        .getDescendantsOfKind(SyntaxKind.Parameter)
        .some((parameter) => parameter.getTypeNode() === undefined) ||
      node.getDescendantsOfKind(SyntaxKind.YieldExpression).length > 0;
    if (
      contextual &&
      (node.getDescendantsOfKind(SyntaxKind.ThisKeyword).length > 0 ||
        (typedByContext && informativeContext(node)))
    ) {
      refuse(
        filePath,
        lineOf(node),
        `${coordinate} relies on contextual parameter, receiver, or yield types that may be lost when it moves to a class member.`,
        "Move these callbacks into explicitly typed helpers outside the resolver map before migrating.",
      );
    }
  }
  // An arrow resolver stays an arrow function, which keeps the return
  // type TypeScript infers for it; a method would infer void where the
  // arrow function infers never.
  if (Node.isArrowFunction(node) || Node.isFunctionExpression(node)) {
    const name = memberName(names, wanted);
    return {
      call: { callee: `subgraph.${name}`, arity: arityOf(node) },
      field: withComments(holder, `readonly ${name} = ${textOf(node)};`),
    };
  }
  if (Node.isMethodDeclaration(node)) {
    const name = memberName(names, wanted);
    return {
      call: { callee: `subgraph.${name}`, arity: arityOf(node) },
      method: {
        name,
        text: withComments(holder, methodText(textOf, name, node)),
      },
    };
  }
  // A value declared elsewhere is a resolver function or, as graphql-tools
  // also accepts, a field config with resolve; its type says which.
  const text = textOf(node);
  const invocation = resolverInvocation(node.getType(), node);
  if (invocation === undefined) {
    refuse(
      filePath,
      lineOf(node),
      `${coordinate} is ${text}, and its type does not say whether it is a resolver function or a { resolve } field config.`,
      `Give ${text} a type, or write ${coordinate} as a resolver function.`,
    );
  }
  checkResolveType(map, filePath, coordinate, invocation.arity);
  if (invocation.member !== "" || !stableArrow(node)) {
    refuse(
      filePath,
      lineOf(node),
      `${coordinate} references ${text}, whose receiver or selected function can change when GraphQL builds its schema. Only const aliases to arrow functions can be moved faithfully.`,
      `Write ${coordinate} as an inline arrow function, or reference a const arrow function directly.`,
    );
  }
  // One declared elsewhere is called where it is: a module-level or
  // imported one by its name, one the factory declared on the instance. A
  // name the entry's callback or getSchema binds goes through a field.
  if (
    Node.isIdentifier(node) &&
    /^(?:this\.#)?[\w$]+$/.test(text) &&
    !CALLBACK_NAMES.has(text)
  ) {
    const callee = text.startsWith("this.")
      ? `subgraph.${text.slice(5)}`
      : text;
    return {
      call: {
        callee: `${callee}${invocation.member}`,
        arity: invocation.arity,
      },
    };
  }
  const name = memberName(names, wanted);
  return {
    call: {
      callee: `subgraph.${name}${invocation.member}`,
      arity: invocation.arity,
    },
    field: withComments(holder, `readonly ${name} = ${text};`),
  };
}

/**
 * A root built elsewhere cannot prove its runtime fields, when its functions
 * are selected, or how each GraphQL engine binds them.
 */
function refuseBuiltRoot(
  typeEntry: ObjectLiteralElementLike,
  typeName: string,
  typeValue: Node,
  filePath: string,
): never {
  const built = typeValue.getType();
  const methods = built
    .getProperties()
    .some((property) =>
      property
        .getDeclarations()
        .some(
          (declaration) =>
            Node.isMethodDeclaration(declaration) &&
            (Node.isClassDeclaration(declaration.getParent()) ||
              Node.isClassExpression(declaration.getParent())),
        ),
    );
  if (built.isAny() || built.isUnknown() || methods) {
    refuse(
      filePath,
      lineOf(typeEntry),
      built.isAny() || built.isUnknown()
        ? `The resolvers of ${typeName} are ${typeValue.getText().split("\n")[0]}, whose type does not say which fields it resolves.`
        : `The resolvers of ${typeName} are a class instance; the schema-first map served none of its methods.`,
      `Give ${typeName}'s resolvers an object type with a resolver per field, or write them as an object literal.`,
    );
  }
  refuse(
    filePath,
    lineOf(typeEntry),
    `${typeName} comes from a resolver map stored outside this literal. Its runtime fields, receiver and selected function cannot be preserved across GraphQL engines.`,
    `Write ${typeName} as an object literal with inline arrow resolvers or const arrow references.`,
  );
}

/** How many arguments a resolver written in the map takes; undefined when it reads them all. */
function arityOf(fn: FunctionLike): number | undefined {
  return fn.getParameters().some((parameter) => parameter.isRestParameter()) ||
    (!Node.isArrowFunction(fn) &&
      fn
        .getDescendantsOfKind(SyntaxKind.Identifier)
        .some(
          (identifier) =>
            identifier.getText() === "arguments" &&
            callFrameOwner(identifier) === fn,
        ))
    ? undefined
    : fn.getParameters().length;
}

/**
 * How a resolver of type `type` is called: as a function, or through the
 * `resolve` of a field config object. Undefined when the type says neither,
 * as an unknown type does.
 */
function resolverInvocation(
  type: Type,
  at: Node,
): { readonly member: "" | ".resolve"; readonly arity: undefined } | undefined {
  if (type.getCallSignatures().length > 0) {
    return { member: "", arity: undefined };
  }
  const resolve = type.getProperty("resolve")?.getTypeAtLocation(at);
  if (resolve !== undefined && resolve.getCallSignatures().length > 0) {
    return { member: ".resolve", arity: undefined };
  }
  return undefined;
}

/**
 * Whether the type a resolver takes from where it is written gives its
 * parameters or yields any type: neither absent, any nor unknown.
 */
function informativeContext(
  node: ArrowFunction | FunctionExpression | MethodDeclaration,
): boolean {
  const informative = (type: Type | undefined) =>
    type !== undefined && !type.isAny() && !type.isUnknown();
  if (!Node.isMethodDeclaration(node)) {
    return informative(node.getContextualType());
  }
  // An optional key's object is contextually typed as `T | undefined`,
  // and a quoted method's name is its text with the quotes.
  const owner = node
    .getParentIfKind(SyntaxKind.ObjectLiteralExpression)
    ?.getContextualType()
    ?.getNonNullableType();
  if (owner === undefined) return false;
  const name = node.getSymbol()?.getName() ?? node.getName();
  // A union owner types the method from every member that declares it.
  return (owner.isUnion() ? owner.getUnionTypes() : [owner]).some((member) => {
    const property = member.getProperty(name);
    return informative(
      property === undefined
        ? member.getStringIndexType()
        : property.getTypeAtLocation(node),
    );
  });
}
