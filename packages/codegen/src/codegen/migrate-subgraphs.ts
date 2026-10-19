import {
  coordinatesOfResolverMap,
  schemaFirstGraphQLDocument,
  typeKindsOfDocument,
} from "document-model/tooling";
import { existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  IndentationText,
  Node,
  Project,
  SyntaxKind,
  VariableDeclarationKind,
  ts,
  type ArrowFunction,
  type CallExpression,
  type ClassDeclaration,
  type ClassMemberTypes,
  type ElementAccessExpression,
  type FunctionDeclaration,
  type FunctionExpression,
  type Identifier,
  type PropertyAccessExpression,
  type SourceFile,
  type Symbol as MorphSymbol,
} from "ts-morph";

import { makeSubgraphsIndexFile } from "../file-builders/subgraphs.js";
import { formatSafe } from "../utils/format-with-prettier.js";

type Diagnostic = { file: string; line: number; message: string };
type ResolverFactory = ArrowFunction | FunctionDeclaration | FunctionExpression;
type FactoryCall = { call: CallExpression; factory: ResolverFactory };
type FieldAccess = PropertyAccessExpression | ElementAccessExpression;
type TypeKinds = ReadonlyMap<string, string>;
export type SubgraphMigrationResult = {
  changedFiles: string[];
  diagnostics: Diagnostic[];
};

class UnsupportedSubgraph extends Error {
  constructor(
    readonly node: Node,
    message: string,
  ) {
    super(message);
  }
}

function unsupported(node: Node, message: string): never {
  throw new UnsupportedSubgraph(node, message);
}

const resolversForm =
  "Resolvers must be an inline resolver map or a resolver factory called as factory(this); update it manually.";
const resolverMapForm =
  "Resolver maps may contain only nested maps, functions, literals and imported or module const values; update it manually.";
const factoryForm =
  "Resolver factories may only read BaseSubgraph services, as in const reactor = subgraph.reactorClient, before returning a resolver map; update it manually.";

function unwrap(node: Node): Node {
  if (
    Node.isParenthesizedExpression(node) ||
    Node.isAsExpression(node) ||
    Node.isSatisfiesExpression(node) ||
    Node.isNonNullExpression(node) ||
    Node.isTypeAssertion(node)
  ) {
    return unwrap(node.getExpression());
  }
  return node;
}

function valueSymbol(node: Node) {
  return Node.isShorthandPropertyAssignment(node)
    ? node.getValueSymbol()
    : node.getSymbol();
}

function declarationsOf(node: Node): Node[] {
  const symbol = valueSymbol(node);
  return (symbol?.getAliasedSymbol() ?? symbol)?.getDeclarations() ?? [];
}

function isModuleConstant(node: Node | undefined): boolean {
  const statement = Node.isVariableDeclaration(node)
    ? node.getVariableStatement()
    : undefined;
  return (
    statement?.getDeclarationKind() === VariableDeclarationKind.Const &&
    (Node.isSourceFile(statement.getParent()) ||
      Node.isModuleBlock(statement.getParent()))
  );
}

function isImportedOrConstant(node: Node): boolean {
  const declarations =
    Node.isIdentifier(node) || Node.isShorthandPropertyAssignment(node)
      ? declarationsOf(node)
      : [];
  const target = declarations.at(0);
  return (
    declarations.length === 1 &&
    (isModuleConstant(target) ||
      (Node.isFunctionDeclaration(target) && !!valueSymbol(node)?.isAlias()))
  );
}

function constantValue(node: Node): Node {
  node = unwrap(node);
  if (!Node.isIdentifier(node)) return node;
  const declarations = declarationsOf(node);
  const target = declarations.at(0);
  if (!target || declarations.length > 1)
    return unsupported(
      node,
      `Cannot resolve a single static declaration for ${node.getText()}.`,
    );
  if (!Node.isVariableDeclaration(target)) return target;
  if (!isModuleConstant(target))
    return unsupported(
      target,
      "Mutable resolver or schema declarations cannot be converted.",
    );
  return constantValue(
    target.getInitializer() ??
      unsupported(target, "Missing static initializer."),
  );
}

function propertyName(node: Node): string {
  if (Node.isIdentifier(node)) return node.getText();
  if (Node.isStringLiteral(node) || Node.isNumericLiteral(node))
    return node.getLiteralText();
  return unsupported(node, resolverMapForm);
}

function isLiteral(node: Node): boolean {
  return (
    Node.isLiteralExpression(node) ||
    Node.isTrueLiteral(node) ||
    Node.isFalseLiteral(node) ||
    Node.isNullLiteral(node)
  );
}

function isInert(node: Node): boolean {
  node = unwrap(node);
  if (!Node.isObjectLiteralExpression(node))
    return isLiteral(node) || isImportedOrConstant(node);
  return node
    .getProperties()
    .every((property) =>
      Node.isShorthandPropertyAssignment(property)
        ? isImportedOrConstant(property)
        : Node.isPropertyAssignment(property) &&
          !Node.isComputedPropertyName(property.getNameNode()) &&
          isInert(property.getInitializerOrThrow()),
    );
}

function isResolverLeaf(node: Node, scalar: boolean): boolean {
  return (
    Node.isMethodDeclaration(node) ||
    Node.isArrowFunction(node) ||
    Node.isFunctionExpression(node) ||
    isLiteral(node) ||
    (isImportedOrConstant(node) &&
      (scalar || node.getType().getCallSignatures().length > 0))
  );
}

function resolverMap(node: Node, typeKinds?: TypeKinds) {
  const map = unwrap(node);
  if (!Node.isObjectLiteralExpression(map))
    return unsupported(node, resolverMapForm);
  const shape: Record<string, unknown> = {};
  for (const property of map.getProperties()) {
    if (Node.isSpreadAssignment(property))
      return unsupported(property, resolverMapForm);
    const name = propertyName(property.getNameNode());
    const value = Node.isPropertyAssignment(property)
      ? unwrap(property.getInitializerOrThrow())
      : property;
    if (Node.isObjectLiteralExpression(value)) shape[name] = resolverMap(value);
    else if (
      !isResolverLeaf(value, typeKinds?.get(name) === "ScalarTypeDefinition")
    )
      return unsupported(value, resolverMapForm);
    else shape[name] = undefined;
  }
  return shape;
}

function schemaDocument(node: Node) {
  const value = constantValue(node);
  const computed =
    "Computed typeDefs cannot be converted; expected an imported or inline gql literal.";
  if (!Node.isTaggedTemplateExpression(value))
    return unsupported(value, computed);
  const tag = value.getTag();
  const imported = tag.getSymbol()?.getDeclarations().at(0);
  if (
    !(
      Node.isImportClause(imported) ||
      (Node.isImportSpecifier(imported) && imported.getName() === "gql")
    ) ||
    imported
      .getFirstAncestorByKind(SyntaxKind.ImportDeclaration)
      ?.getModuleSpecifierValue() !== "graphql-tag"
  )
    return unsupported(
      tag,
      "Computed typeDefs tag cannot be converted; expected gql from graphql-tag.",
    );
  const template = value.getTemplate();
  if (!Node.isNoSubstitutionTemplateLiteral(template))
    return unsupported(value, computed);
  try {
    return schemaFirstGraphQLDocument([template.getLiteralText()]).document;
  } catch (error) {
    return unsupported(
      value,
      `Invalid typeDefs: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

const removedMembers = new Set([
  "name",
  "typeDefs",
  "resolvers",
  "hasSubscriptions",
  "path",
  "additionalContextFields",
]);

const constructedMembers = new Set([
  "reactorClient",
  "http",
  "graphqlManager",
  "relationalDb",
  "syncManager",
  "documentPermissionService",
  "authorizationService",
  "syncServingGate",
  "credentials",
]);

function prepareClass(klass: ClassDeclaration) {
  const name = klass.getProperty("name");
  const typeDefs = klass.getProperty("typeDefs");
  const resolvers = klass.getProperty("resolvers");
  const schema = typeDefs?.getInitializer();
  const resolver = resolvers?.getInitializer();
  if (!name || !schema || !resolver) {
    return unsupported(
      klass,
      "Old-style subgraph needs name, typeDefs and resolvers property initializers.",
    );
  }
  const nameValue = name.getInitializer();
  if (!Node.isStringLiteral(nameValue)) {
    return unsupported(
      name,
      "Subgraph name must be a string literal. Public URLs cannot be inferred.",
    );
  }
  const subgraphName = nameValue.getLiteralText();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(subgraphName)) {
    return unsupported(
      name,
      `Subgraph name ${JSON.stringify(subgraphName)} is not canonical lowercase kebab-case. Rename it explicitly because it is a public URL.`,
    );
  }
  const typeKinds = typeKindsOfDocument(schemaDocument(schema));
  const className = klass.getName();
  if (!className)
    return unsupported(
      klass,
      "Anonymous subgraph classes cannot be converted.",
    );
  if (klass.getMember("getSchema") || klass.getMember("subgraphName")) {
    return unsupported(klass, "Class mixes old and new subgraph declarations.");
  }
  for (const member of klass.getMembers()) {
    const field = memberName(member);
    if (constructedMembers.has(field))
      unsupported(member, replacedService(field));
    if (
      removedMembers.has(field) &&
      member !== resolvers &&
      member !== typeDefs &&
      !(
        Node.isPropertyDeclaration(member) &&
        isInert(member.getInitializer() ?? member)
      )
    )
      unsupported(
        member,
        `${field} must be a literal or an imported or module const value; update it manually.`,
      );
  }
  const factory = factoryCall(resolver);
  const shape = factory
    ? factoryMap(factory.factory, klass, typeKinds)
    : resolverMap(resolver, typeKinds);
  for (const receiver of klass.getDescendantsOfKind(SyntaxKind.ThisKeyword)) {
    const owner = receiverOwner(receiver);
    if (
      owner?.getParent() !== klass ||
      (Node.isStaticable(owner) && owner.isStatic()) ||
      receiver === factory?.call.getArguments().at(0)
    )
      continue;
    const access =
      receiverAccess(receiver) ??
      unsupported(
        receiver,
        "Instance code uses this as a value (an alias, destructuring, an argument, a return value or a stored value); read members as this.member or update it manually.",
      );
    const key = checkMemberAccess("Instance code", access);
    if (constructedMembers.has(key) && isAssignmentTarget(access))
      unsupported(access, replacedService(key));
  }
  for (const keyword of resolver.getDescendantsOfKind(SyntaxKind.SuperKeyword))
    if (receiverOwner(keyword)?.getParent() === klass)
      unsupported(
        keyword,
        "Resolvers use super, which changes meaning when migration moves them into the static getSchema; update it manually.",
      );
  checkReferences(klass, className, factory);
  return {
    klass,
    subgraphName,
    schema: schema.getText(),
    resolver,
    coordinates: coordinatesOfResolverMap(shape, typeKinds),
    className,
    factory,
  };
}

function replacedService(member: string) {
  return `Instance code replaces the BaseSubgraph service ${member}, which resolvers may capture; the migrated class builds resolvers after onSetup instead of at construction, so update it manually.`;
}

function factoryCall(resolver: Node): FactoryCall | undefined {
  const call = unwrap(resolver);
  if (!Node.isCallExpression(call)) return undefined;
  const callee = call.getExpression();
  const args = call.getArguments();
  if (
    call.hasQuestionDotToken() ||
    !Node.isIdentifier(callee) ||
    args.length !== 1 ||
    args.at(0)?.getKind() !== SyntaxKind.ThisKeyword
  )
    return unsupported(call, resolversForm);
  const factory = constantValue(callee);
  if (
    Node.isArrowFunction(factory) ||
    Node.isFunctionDeclaration(factory) ||
    Node.isFunctionExpression(factory)
  )
    return { call, factory };
  return unsupported(call, resolversForm);
}

function factoryMap(
  factory: ResolverFactory,
  klass: ClassDeclaration,
  typeKinds: TypeKinds,
) {
  const parameters = factory.getParameters();
  const parameter = parameters.at(0);
  if (parameters.length > 1 || parameter?.isRestParameter())
    unsupported(factory, factoryForm);
  const name = parameter?.getNameNode();
  if (name && !Node.isIdentifier(name))
    unsupported(
      name,
      "Destructured resolver factory parameters need manual migration.",
    );
  for (const reference of name?.findReferencesAsNodes() ?? [])
    checkMemberAccess(
      "Resolver factory",
      receiverAccess(reference) ??
        unsupported(
          reference,
          "Resolver factory passes its subgraph parameter dynamically; update it manually.",
        ),
    );
  const type = parameter?.getTypeNode();
  if (
    type &&
    type.getKind() !== SyntaxKind.AnyKeyword &&
    type.getKind() !== SyntaxKind.UnknownKeyword &&
    !(
      Node.isTypeReference(type) &&
      (importsBaseSubgraph(type.getTypeName()) ||
        declarationsOf(type.getTypeName()).includes(klass))
    )
  )
    unsupported(
      type,
      `Resolver factory parameter type ${type.getText()} may require an old authoring field; type it as BaseSubgraph or the subgraph class, then run the migration again.`,
    );
  const body = factory.getBody() ?? unsupported(factory, factoryForm);
  if (!Node.isBlock(body)) return resolverMap(body, typeKinds);
  const statements = body.getStatements();
  const returned = statements.pop();
  for (const statement of statements) {
    const reads =
      Node.isVariableStatement(statement) &&
      statement.getDeclarationKind() === VariableDeclarationKind.Const
        ? statement.getDeclarations()
        : [];
    const read = reads.at(0);
    const value = read?.getInitializer();
    if (
      reads.length !== 1 ||
      !Node.isIdentifier(read?.getNameNode()) ||
      !Node.isPropertyAccessExpression(value) ||
      value.getExpression().getText() !== name?.getText() ||
      !constructedMembers.has(value.getName())
    )
      unsupported(statement, factoryForm);
  }
  if (!Node.isReturnStatement(returned)) return unsupported(body, factoryForm);
  return resolverMap(returned.getExpression() ?? returned, typeKinds);
}

function receiverOwner(node: Node) {
  return node.getFirstAncestor(
    (ancestor) =>
      Node.isFunctionExpression(ancestor) ||
      Node.isFunctionDeclaration(ancestor) ||
      Node.isMethodDeclaration(ancestor) ||
      Node.isGetAccessorDeclaration(ancestor) ||
      Node.isSetAccessorDeclaration(ancestor) ||
      Node.isConstructorDeclaration(ancestor) ||
      Node.isPropertyDeclaration(ancestor) ||
      Node.isClassStaticBlockDeclaration(ancestor),
  );
}

function outermostWrapper(node: Node): Node {
  let wrapper = node;
  for (
    let parent = wrapper.getParent();
    parent && unwrap(parent) === node;
    parent = wrapper.getParent()
  )
    wrapper = parent;
  return wrapper;
}

function receiverAccess(receiver: Node): FieldAccess | undefined {
  const target = outermostWrapper(receiver);
  const access = target.getParent();
  return (Node.isPropertyAccessExpression(access) ||
    Node.isElementAccessExpression(access)) &&
    access.getExpression() === target
    ? access
    : undefined;
}

function accessKey(access: FieldAccess): string | undefined {
  return Node.isPropertyAccessExpression(access)
    ? access.getName()
    : access
        .getArgumentExpression()
        ?.asKind(SyntaxKind.StringLiteral)
        ?.getLiteralText();
}

function isAssignmentTarget(node: Node): boolean {
  const parent = node.getParentOrThrow();
  if (Node.isBinaryExpression(parent)) {
    const operator = parent.getOperatorToken().getKind();
    return (
      parent.getLeft() === node &&
      operator >= SyntaxKind.FirstAssignment &&
      operator <= SyntaxKind.LastAssignment
    );
  }
  if (Node.isForOfStatement(parent) || Node.isForInStatement(parent))
    return parent.getInitializer() === node;
  if (
    Node.isPrefixUnaryExpression(parent) ||
    Node.isPostfixUnaryExpression(parent)
  )
    return (
      parent.getOperatorToken() === SyntaxKind.PlusPlusToken ||
      parent.getOperatorToken() === SyntaxKind.MinusMinusToken
    );
  return (
    Node.isDeleteExpression(parent) ||
    ((unwrap(parent) !== parent ||
      Node.isArrayLiteralExpression(parent) ||
      Node.isObjectLiteralExpression(parent) ||
      Node.isPropertyAssignment(parent)) &&
      isAssignmentTarget(parent))
  );
}

function checkReferences(
  klass: ClassDeclaration,
  className: string,
  factory: FactoryCall | undefined,
) {
  const parameterType = factory?.factory.getParameters().at(0)?.getTypeNode();
  for (const reference of klass.findReferencesAsNodes()) {
    if (
      isModuleEdge(reference) ||
      (parameterType && reference.getParent() === parameterType)
    )
      continue;
    unsupported(
      reference,
      `Package code references ${className} outside an import or export, and migration removes its old fields; update it manually.`,
    );
  }
  const escape = namespaceEscape(klass);
  if (escape)
    unsupported(
      escape,
      `Package code uses a namespace that exposes ${className} other than to read a named member, and migration removes its old fields; update it manually.`,
    );
}

function isPackageModule(
  symbol: MorphSymbol | undefined,
): symbol is MorphSymbol {
  return !!symbol
    ?.getDeclarations()
    .some((file) => Node.isSourceFile(file) && !file.isInNodeModules());
}

function exportsOf(module: MorphSymbol, klass: ClassDeclaration) {
  return new Map(
    klass
      .getProject()
      .getTypeChecker()
      .getExportsOfModule(module)
      .map((entry) => [entry.getName(), entry.getAliasedSymbol() ?? entry]),
  );
}

function isSubgraphsBarrel(module: MorphSymbol, klass: ClassDeclaration) {
  return module
    .getDeclarations()
    .some(
      (file) =>
        Node.isSourceFile(file) &&
        file.getBaseName() === "index.ts" &&
        file.getDirectory().getBaseName() === "subgraphs" &&
        file.getDirectory().isAncestorOf(klass.getSourceFile()),
    );
}

function exposes(
  module: MorphSymbol,
  klass: ClassDeclaration,
  seen = new Set<MorphSymbol>(),
): boolean {
  if (seen.has(module)) return false;
  seen.add(module);
  if (isSubgraphsBarrel(module, klass)) return true;
  return [...exportsOf(module, klass).values()].some(
    (target) =>
      target.getDeclarations().includes(klass) ||
      (isPackageModule(target) && exposes(target, klass, seen)),
  );
}

function namespaceEscape(klass: ClassDeclaration): Node | undefined {
  const project = klass.getProject();
  for (const file of project.getSourceFiles()) {
    for (const binding of file
      .getImportDeclarations()
      .flatMap((entry) => [
        entry.getNamespaceImport(),
        entry.getDefaultImport(),
        ...entry
          .getNamedImports()
          .map((named) => named.getAliasNode() ?? named.getNameNode()),
      ])) {
      const module = binding?.getSymbol()?.getAliasedSymbol();
      if (
        Node.isIdentifier(binding) &&
        isPackageModule(module) &&
        exposes(module, klass)
      ) {
        const escape = referenceEscape(binding, module, klass);
        if (escape) return escape;
      }
    }
    for (const call of file.getDescendantsOfKind(SyntaxKind.CallExpression)) {
      const callee = call.getExpression();
      if (
        callee.getKind() !== SyntaxKind.ImportKeyword &&
        !(Node.isIdentifier(callee) && callee.getText() === "require")
      )
        continue;
      const specifier = call.getArguments().at(0);
      if (
        !Node.isStringLiteral(specifier) &&
        !Node.isNoSubstitutionTemplateLiteral(specifier)
      )
        return call;
      const resolved = ts.resolveModuleName(
        specifier.getLiteralText(),
        file.getFilePath(),
        project.getCompilerOptions(),
        project.getModuleResolutionHost(),
      ).resolvedModule;
      const module =
        resolved &&
        project.getSourceFile(resolved.resolvedFileName)?.getSymbol();
      if (!isPackageModule(module) || !exposes(module, klass)) continue;
      const loaded =
        callee.getKind() === SyntaxKind.ImportKeyword
          ? call.getParentIfKind(SyntaxKind.AwaitExpression)
          : call;
      const escape = loaded ? valueEscape(loaded, module, klass) : call;
      if (escape) return escape;
    }
  }
  return undefined;
}

function referenceEscape(
  name: Identifier,
  module: MorphSymbol,
  klass: ClassDeclaration,
) {
  for (const reference of name.findReferencesAsNodes()) {
    const escape = reference !== name && valueEscape(reference, module, klass);
    if (escape) return escape;
  }
  return undefined;
}

function valueEscape(
  node: Node,
  module: MorphSymbol,
  klass: ClassDeclaration,
): Node | undefined {
  let value = node;
  let parent = value.getParentOrThrow();
  while (
    (Node.isPropertyAccessExpression(parent) &&
      parent.getNameNode() === value) ||
    (Node.isQualifiedName(parent) && parent.getRight() === value) ||
    unwrap(parent) !== parent
  ) {
    value = parent;
    parent = value.getParentOrThrow();
  }
  if (isModuleEdge(value)) return undefined;
  const access = receiverAccess(value);
  const key = access
    ? accessKey(access)
    : Node.isQualifiedName(parent) && parent.getLeft() === value
      ? parent.getRight().getText()
      : undefined;
  if (key !== undefined) {
    const member = exportsOf(module, klass).get(key);
    if (member?.getDeclarations().includes(klass)) return parent;
    return isPackageModule(member)
      ? valueEscape(parent, member, klass)
      : undefined;
  }
  if (Node.isVariableDeclaration(parent) && parent.getInitializer() === value) {
    const alias = parent.getNameNode();
    if (Node.isIdentifier(alias)) return referenceEscape(alias, module, klass);
  }
  return value;
}

function memberName(member: ClassMemberTypes): string {
  return "getName" in member && !Node.isConstructorDeclaration(member)
    ? member.getName()
    : "";
}

function isLegacyMember(member: ClassMemberTypes): boolean {
  return removedMembers.has(memberName(member));
}

function ensureLifecycleHooksCallSuper(klass: ClassDeclaration) {
  for (const name of ["onSetup", "onDisconnect"]) {
    const method = klass.getMethod(name);
    if (!method) continue;
    method.setHasOverrideKeyword(true);
    const body = method.getBody();
    if (!body || !Node.isBlock(body)) continue;
    const callsSuper = body
      .getDescendantsOfKind(SyntaxKind.CallExpression)
      .some((call) => {
        const target = call.getExpression();
        return (
          Node.isPropertyAccessExpression(target) &&
          target.getExpression().getKind() === SyntaxKind.SuperKeyword &&
          target.getName() === name
        );
      });
    if (!callsSuper) {
      method.setIsAsync(true);
      method.insertStatements(0, `await super.${name}();`);
    }
  }
}

function rewriteClass(
  prepared: PreparedClass,
  names: { builder: string; subgraph: string; builderType: string },
) {
  const { klass, subgraphName, schema, resolver, coordinates, className } =
    prepared;
  const expression = new Project({
    useInMemoryFileSystem: true,
  }).createSourceFile(
    `__subgraph_migration_${className}.ts`,
    `const value = ${resolver.getText()};`,
    { overwrite: true },
  );
  for (const node of expression.getDescendantsOfKind(SyntaxKind.ThisKeyword))
    if (!receiverOwner(node)) node.replaceWithText(names.subgraph);
  const initializer = expression
    .getVariableDeclarationOrThrow("value")
    .getInitializerOrThrow();
  const factory = Node.isObjectLiteralExpression(initializer)
    ? `(${initializer.getText()})`
    : initializer.getText();
  expression.forget();
  for (const member of klass.getMembers())
    if (isLegacyMember(member)) member.remove();
  klass.insertMembers(0, [
    `static override readonly subgraphName = ${JSON.stringify(subgraphName)};`,
    `static override getSchema(${names.builder}: ${names.builderType}<${className}>) {\nreturn ${names.builder}.graphql({\ntypeDefs: ${schema},\nresolverCoordinates: ${JSON.stringify(coordinates, null, 2)},\nresolvers: (${names.subgraph}) => ${factory},\n});\n}`,
  ]);
  ensureLifecycleHooksCallSuper(klass);
}

function checkMemberAccess(subject: string, access: FieldAccess): string {
  const key = accessKey(access);
  if (key === undefined)
    return unsupported(
      access,
      `${subject} reads an old authoring field dynamically; update it manually.`,
    );
  if (removedMembers.has(key))
    unsupported(
      access,
      key === "name"
        ? `${subject} accesses the old name field; update it manually to use subgraphName instead.`
        : `${subject} reads or writes an old authoring field; update it manually.`,
    );
  return key;
}

function reactorImportsOf(file: SourceFile) {
  return file
    .getImportDeclarations()
    .filter(
      (entry) =>
        entry.getModuleSpecifierValue() === "@powerhousedao/reactor-api",
    );
}

function importsBaseSubgraph(name: Node): boolean {
  return reactorImportsOf(name.getSourceFile())
    .flatMap((entry) => entry.getNamedImports())
    .some(
      (named) =>
        named.getName() === "BaseSubgraph" &&
        (named.getAliasNode()?.getText() ?? named.getName()) === name.getText(),
    );
}

function hasOpaqueReturnType(factory: ResolverFactory): boolean {
  const annotation = factory.getReturnTypeNode();
  if (!Node.isTypeReference(annotation)) return false;
  const typeArguments = annotation.getTypeArguments();
  return (
    annotation.getTypeName().getText() === "Record" &&
    typeArguments.length === 2 &&
    typeArguments.at(0)?.getKind() === SyntaxKind.StringKeyword &&
    typeArguments.at(1)?.getKind() === SyntaxKind.UnknownKeyword
  );
}

function directlyExtendsBase(klass: ClassDeclaration): boolean {
  const base = klass.getExtends()?.getExpression();
  return Node.isIdentifier(base) && importsBaseSubgraph(base);
}

function ancestry(
  klass: ClassDeclaration,
  seen = new Set<ClassDeclaration>(),
): ClassDeclaration[] {
  if (directlyExtendsBase(klass) || seen.has(klass)) return [];
  seen.add(klass);
  const symbol = klass.getExtends()?.getExpression().getSymbol();
  const parent = (symbol?.getAliasedSymbol() ?? symbol)
    ?.getDeclarations()
    .find(Node.isClassDeclaration);
  return parent ? [parent, ...ancestry(parent, seen)] : [];
}

function isMigrationCandidate(klass: ClassDeclaration): boolean {
  const bases = ancestry(klass);
  if (
    ![klass, ...bases].some((candidate) =>
      candidate.getMembers().some(isLegacyMember),
    )
  )
    return false;
  if (directlyExtendsBase(klass)) {
    if (klass.getDerivedClasses().length === 0) return true;
    return unsupported(
      klass,
      "Old-style subgraph is a shared base; update its inherited fields and schema manually.",
    );
  }
  if (bases.some(directlyExtendsBase))
    return unsupported(
      klass,
      "Old-style subgraph extends a shared base; update its inherited fields and schema manually.",
    );
  return false;
}

type PreparedClass = ReturnType<typeof prepareClass>;
type FilePlan = { file: SourceFile; prepared: PreparedClass[] };

function planFile(file: SourceFile): FilePlan | undefined {
  const prepared = file
    .getClasses()
    .filter(isMigrationCandidate)
    .map(prepareClass);
  return prepared.length > 0 ? { file, prepared } : undefined;
}

function factoryReferences(factory: ResolverFactory): Node[] {
  if (Node.isFunctionDeclaration(factory))
    return factory.findReferencesAsNodes();
  const parent = outermostWrapper(factory).getParent();
  if (Node.isVariableDeclaration(parent)) return parent.findReferencesAsNodes();
  return unsupported(
    factory,
    "Resolver factory cannot be traced to its uses; declare it as a named function or const, or update it manually.",
  );
}

function isModuleEdge(reference: Node): boolean {
  return [reference, reference.getParent()].some(
    (node) =>
      Node.isImportSpecifier(node) ||
      Node.isExportSpecifier(node) ||
      Node.isImportClause(node) ||
      Node.isNamespaceExport(node) ||
      Node.isExportAssignment(node),
  );
}

function hasRefusedCandidate(
  file: SourceFile,
  converted: ReadonlySet<ClassDeclaration>,
): boolean {
  return file.getClasses().some((klass) => {
    if (converted.has(klass)) return false;
    try {
      return isMigrationCandidate(klass);
    } catch (error) {
      if (error instanceof UnsupportedSubgraph) return true;
      throw error;
    }
  });
}

function checkSharedFactories(
  plan: FilePlan,
  converted: ReadonlySet<ClassDeclaration>,
  supportedCallees: ReadonlySet<Node>,
): FilePlan {
  for (const { className, factory: entry } of plan.prepared) {
    if (!entry) continue;
    const { factory } = entry;
    const other = factoryReferences(factory).find(
      (reference) =>
        !supportedCallees.has(reference) && !isModuleEdge(reference),
    );
    if (other)
      unsupported(
        other,
        `${className}'s resolver factory is also used here, outside the classes being migrated; give ${className} its own factory or update it manually.`,
      );
    if (
      hasOpaqueReturnType(factory) &&
      hasRefusedCandidate(factory.getSourceFile(), converted)
    )
      unsupported(
        factory.getReturnTypeNodeOrThrow(),
        `${className}'s resolver factory needs this return type removed, but its file has a subgraph that cannot be migrated; migrate that subgraph first or update ${className} manually.`,
      );
  }
  return plan;
}

function rewriteFile({ file, prepared }: FilePlan) {
  const identifiers = new Set(
    file
      .getDescendantsOfKind(SyntaxKind.Identifier)
      .map((node) => node.getText()),
  );
  const freshName = (preferred: string) => {
    let name = preferred;
    while (identifiers.has(name)) name += "_";
    identifiers.add(name);
    return name;
  };
  const reactorImports = reactorImportsOf(file);
  const reactorImport =
    reactorImports.find((entry) => !entry.isTypeOnly()) ??
    file.addImportDeclaration({
      moduleSpecifier: "@powerhousedao/reactor-api",
    });
  const existingBuilderImport = reactorImports
    .flatMap((entry) => entry.getNamedImports())
    .find((named) => named.getName() === "SchemaBuilder");
  const builderType = existingBuilderImport
    ? (existingBuilderImport.getAliasNode()?.getText() ??
      existingBuilderImport.getName())
    : freshName("SchemaBuilder");
  if (!existingBuilderImport)
    reactorImport.addNamedImport({
      name: "SchemaBuilder",
      isTypeOnly: true,
      ...(builderType === "SchemaBuilder" ? {} : { alias: builderType }),
    });
  const names = {
    builder: freshName("schemaBuilder"),
    subgraph: freshName("s"),
    builderType,
  };
  for (const entry of prepared) rewriteClass(entry, names);
  for (const entry of file.getImportDeclarations()) {
    if (entry.getModuleSpecifierValue() !== "graphql") continue;
    for (const named of entry.getNamedImports()) {
      if (named.getName() !== "DocumentNode") continue;
      const identifier = named.getAliasNode() ?? named.getNameNode();
      if (!Node.isIdentifier(identifier)) continue;
      const usedInFile = identifier
        .findReferencesAsNodes()
        .some(
          (reference) =>
            reference !== identifier && reference.getSourceFile() === file,
        );
      if (!usedInFile) named.remove();
    }
    if (
      !entry.getNamedImports().length &&
      !entry.getDefaultImport() &&
      !entry.getNamespaceImport()
    )
      entry.remove();
  }
}

async function migrateSourceFiles(files: readonly SourceFile[]) {
  const diagnostics: Diagnostic[] = [];
  const attempt = <T>(step: () => T): T | undefined => {
    try {
      return step();
    } catch (error) {
      if (!(error instanceof UnsupportedSubgraph)) throw error;
      const diagnostic = {
        file: error.node.getSourceFile().getFilePath(),
        line: error.node.getStartLineNumber(),
        message: error.message,
      };
      if (
        !diagnostics.some(
          (entry) => JSON.stringify(entry) === JSON.stringify(diagnostic),
        )
      )
        diagnostics.push(diagnostic);
      return undefined;
    }
  };
  let plans = files.flatMap((file) => attempt(() => planFile(file)) ?? []);
  for (let count = Infinity; plans.length < count;) {
    count = plans.length;
    const prepared = plans.flatMap((plan) => plan.prepared);
    const converted = new Set(prepared.map((entry) => entry.klass));
    const supportedCallees = new Set(
      prepared.flatMap((entry) => entry.factory?.call.getExpression() ?? []),
    );
    plans = plans.flatMap(
      (plan) =>
        attempt(() =>
          checkSharedFactories(plan, converted, supportedCallees),
        ) ?? [],
    );
  }
  const opaqueFactories = [
    ...new Set(
      plans.flatMap((plan) =>
        plan.prepared.flatMap((entry) => entry.factory?.factory ?? []),
      ),
    ),
  ].filter(hasOpaqueReturnType);
  for (const factory of opaqueFactories) factory.removeReturnType();
  for (const plan of plans) rewriteFile(plan);
  const changedFiles = new Set([
    ...plans.map((plan) => plan.file),
    ...opaqueFactories.map((factory) => factory.getSourceFile()),
  ]);
  for (const file of changedFiles)
    file.replaceWithText(await formatSafe(file.getFullText()));
  return { converted: plans.map((plan) => plan.file), diagnostics };
}

export async function migrateSubgraphSourceFile(
  sourceFile: SourceFile,
): Promise<{
  changed: boolean;
  diagnostics: Diagnostic[];
}> {
  const { converted, diagnostics } = await migrateSourceFiles([sourceFile]);
  return { changed: converted.length > 0, diagnostics };
}

export async function migrateSubgraphs(
  projectDir = process.cwd(),
): Promise<SubgraphMigrationResult> {
  const root = resolve(projectDir, "subgraphs");
  const result: SubgraphMigrationResult = { changedFiles: [], diagnostics: [] };
  if (!existsSync(root)) return result;
  const tsConfigFilePath = join(projectDir, "tsconfig.json");
  const hasTsConfig = existsSync(tsConfigFilePath);
  const project = new Project({
    ...(hasTsConfig ? { tsConfigFilePath } : {}),
    skipAddingFilesFromTsConfig: true,
    manipulationSettings: { indentationText: IndentationText.TwoSpaces },
  });
  function addDirectory(directory: string) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (
        ["node_modules", "dist", ".git", ".tsbuild"].includes(entry.name) ||
        entry.name.startsWith(".")
      )
        continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) addDirectory(path);
      else if (
        /\.(?:ts|mts|tsx)$/.test(entry.name) &&
        !entry.name.endsWith(".d.ts")
      )
        project.addSourceFileAtPath(path);
    }
  }
  addDirectory(root);
  const subgraphFiles = project.getSourceFiles();
  if (hasTsConfig) project.addSourceFilesFromTsConfig(tsConfigFilePath);
  addDirectory(resolve(projectDir));
  const outcome = await migrateSourceFiles(subgraphFiles);
  const converted = new Set(
    outcome.converted.map((file) => file.getFilePath()),
  );
  result.diagnostics.push(...outcome.diagnostics);
  const barrel = project.getSourceFile(join(root, "index.ts"));
  if (barrel !== undefined && converted.size > 0) {
    const before = barrel.getFullText();
    await makeSubgraphsIndexFile({
      project,
      subgraphsDir: root,
      requireClassExports: converted,
    });
    if (barrel.getFullText() !== before)
      result.changedFiles.push(barrel.getFilePath());
  }
  for (const file of project.getSourceFiles()) {
    if (!file.isSaved()) {
      await file.save();
      result.changedFiles.push(file.getFilePath());
    }
  }
  return result;
}
