import { existsSync, readFileSync } from "node:fs";
import {
  Node,
  type ObjectLiteralElementLike,
  type ObjectLiteralExpression,
  Project,
  type SourceFile,
  SyntaxKind,
  ts,
} from "ts-morph";

export function readIfExists(filePath: string): string | undefined {
  return existsSync(filePath) ? readFileSync(filePath, "utf-8") : undefined;
}

const normalizeEntry = (entry: string) =>
  entry.replace(/^\.\//, "").replace(/\/$/, "");

function jsonValueAt(text: string, keyPath: readonly string[]): unknown {
  const parsed = ts.parseConfigFileTextToJson("config.json", text);
  if (parsed.error) {
    throw new Error(
      ts.flattenDiagnosticMessageText(parsed.error.messageText, "\n"),
    );
  }
  let value: unknown = parsed.config;
  for (const key of keyPath) {
    if (typeof value !== "object" || value === null) return undefined;
    value = (value as Record<string, unknown>)[key];
  }
  return value;
}

function jsonArrayNodeAt(
  file: ts.JsonSourceFile,
  keyPath: readonly string[],
): ts.ArrayLiteralExpression | undefined {
  let node: ts.Expression | undefined = file.statements[0]?.expression;
  for (const key of keyPath) {
    if (!node || !ts.isObjectLiteralExpression(node)) return undefined;
    node = node.properties
      .filter(ts.isPropertyAssignment)
      .find(
        (p) => ts.isStringLiteral(p.name) && p.name.text === key,
      )?.initializer;
  }
  return node && ts.isArrayLiteralExpression(node) ? node : undefined;
}

/** The template JSON(C) with the entries the project added to each listed
 * array appended; the template's comments survive. */
export function withProjectArrayEntries(
  fileName: string,
  template: string,
  existing: string | undefined,
  arrays: readonly {
    keyPath: readonly string[];
    // Entries earlier templates shipped and the current one removed.
    dropped?: readonly string[];
  }[],
): string {
  if (existing === undefined) return template;
  const edits: { pos: number; text: string }[] = [];
  const templateFile = ts.parseJsonText(fileName, template);
  for (const { keyPath, dropped = [] } of arrays) {
    let projectEntries: unknown;
    try {
      projectEntries = jsonValueAt(existing, keyPath);
    } catch (error) {
      console.warn(
        `⚠ ${fileName}: could not read the project's ${keyPath.join(".")} (${String(error)}); it is reset to the template.`,
      );
      return template;
    }
    if (!Array.isArray(projectEntries)) continue;
    const arrayNode = jsonArrayNodeAt(templateFile, keyPath);
    if (!arrayNode) continue;
    const known = [
      ...arrayNode.elements
        .filter(ts.isStringLiteral)
        .map((e) => normalizeEntry(e.text)),
      ...dropped.map(normalizeEntry),
    ];
    const extras = projectEntries.filter(
      (entry): entry is string =>
        typeof entry === "string" && !known.includes(normalizeEntry(entry)),
    );
    const unique = [...new Set(extras)];
    if (unique.length === 0) continue;
    const last = arrayNode.elements.at(-1);
    const text = unique.map((e) => JSON.stringify(e)).join(", ");
    edits.push(
      last
        ? { pos: last.end, text: `, ${text}` }
        : { pos: arrayNode.elements.pos, text },
    );
  }
  return edits
    .sort((a, b) => b.pos - a.pos)
    .reduce(
      (text, edit) =>
        text.slice(0, edit.pos) + edit.text + text.slice(edit.pos),
      template,
    );
}

function getTestOptions(sourceFile: SourceFile) {
  const config = sourceFile
    .getDescendantsOfKind(SyntaxKind.CallExpression)
    .find((call) => call.getExpression().getText() === "defineConfig")
    ?.getArguments()
    .at(0);
  if (!Node.isObjectLiteralExpression(config)) return undefined;
  const test = config.getProperty("test");
  if (!Node.isPropertyAssignment(test)) return undefined;
  const initializer = test.getInitializer();
  return Node.isObjectLiteralExpression(initializer) ? initializer : undefined;
}

type RequiredImport = {
  moduleSpecifier: string;
  namedImport?: string;
  defaultImport?: string;
  namespaceImport?: string;
};

/** The imports a node needs to move to another file; undefined when it uses
 * something declared in its own file. */
function requiredImports(node: Node): RequiredImport[] | undefined {
  const imports: RequiredImport[] = [];
  for (const identifier of node.getDescendantsOfKind(SyntaxKind.Identifier)) {
    for (const declaration of identifier.getSymbol()?.getDeclarations() ?? []) {
      if (declaration.getSourceFile() !== node.getSourceFile()) continue;
      if (
        declaration.getPos() >= node.getPos() &&
        declaration.getEnd() <= node.getEnd()
      ) {
        continue;
      }
      const importDeclaration = declaration.getFirstAncestorByKind(
        SyntaxKind.ImportDeclaration,
      );
      if (!importDeclaration) return undefined;
      const moduleSpecifier = importDeclaration.getModuleSpecifierValue();
      if (Node.isImportSpecifier(declaration)) {
        imports.push({ moduleSpecifier, namedImport: declaration.getText() });
      } else if (Node.isNamespaceImport(declaration)) {
        imports.push({
          moduleSpecifier,
          namespaceImport: declaration.getName(),
        });
      } else if (Node.isImportClause(declaration)) {
        imports.push({
          moduleSpecifier,
          defaultImport: declaration.getDefaultImport()?.getText(),
        });
      }
    }
  }
  return imports;
}

function addImport(sourceFile: SourceFile, required: RequiredImport) {
  const { moduleSpecifier, namedImport, defaultImport, namespaceImport } =
    required;
  if (namespaceImport) {
    if (
      !sourceFile
        .getImportDeclarations()
        .some((d) => d.getNamespaceImport()?.getText() === namespaceImport)
    ) {
      sourceFile.addImportDeclaration({ moduleSpecifier, namespaceImport });
    }
    return;
  }
  const declaration = sourceFile
    .getImportDeclarations()
    .find(
      (d) =>
        d.getModuleSpecifierValue() === moduleSpecifier &&
        !d.isTypeOnly() &&
        !d.getNamespaceImport(),
    );
  if (!declaration) {
    sourceFile.addImportDeclaration({
      moduleSpecifier,
      defaultImport,
      namedImports: namedImport ? [namedImport] : undefined,
    });
    return;
  }
  if (defaultImport && !declaration.getDefaultImport()) {
    declaration.setDefaultImport(defaultImport);
  }
  const names = declaration.getNamedImports().map((n) => n.getText());
  if (namedImport && !names.includes(namedImport)) {
    const index = names.findIndex(
      (name) => name.localeCompare(namedImport) > 0,
    );
    declaration.insertNamedImport(
      index === -1 ? names.length : index,
      namedImport,
    );
  }
}

function mergeArrayElements(
  target: ObjectLiteralExpression,
  name: string,
  source: Node,
): boolean {
  const property = target.getProperty(name);
  const targetArray = Node.isPropertyAssignment(property)
    ? property.getInitializer()
    : undefined;
  if (
    !Node.isArrayLiteralExpression(targetArray) ||
    !Node.isArrayLiteralExpression(source)
  ) {
    return false;
  }
  const existing = targetArray.getElements().map((e) => e.getText());
  for (const element of source.getElements()) {
    if (!existing.includes(element.getText())) {
      targetArray.addElement(element.getText());
    }
  }
  return true;
}

const withoutSpace = (text: string) => text.replace(/\s+/g, "");

function warnIfOverridden(name: string, template: Node, project: Node) {
  const templateValue = Node.isPropertyAssignment(template)
    ? template.getInitializer()?.getText()
    : template.getText();
  if (withoutSpace(templateValue ?? "") === withoutSpace(project.getText())) {
    return;
  }
  console.warn(
    `⚠ vitest.config.ts: \`test.${name}\` is set by the template; the project's \`${project.getText()}\` was replaced.`,
  );
}

/* Right after the template's copy of the option that precedes it in the project */
function insertionIndex(
  target: ObjectLiteralExpression,
  source: ObjectLiteralExpression,
  property: ObjectLiteralElementLike,
) {
  const names = target
    .getProperties()
    .map((p) => (Node.isPropertyAssignment(p) ? p.getName() : undefined));
  const properties = source.getProperties();
  const preceding = properties
    .slice(0, properties.indexOf(property))
    .filter(Node.isPropertyAssignment)
    .map((p) => p.getName())
    .reverse()
    .find((name) => names.includes(name));
  return preceding === undefined ? 0 : names.indexOf(preceding) + 1;
}

/** The template vitest.config.ts plus the project's own `test` options and
 * their imports; the project's file as it is when those can't be read. */
export function mergedVitestConfig(
  template: string,
  existing: string | undefined,
): string {
  if (existing === undefined) return template;
  const project = new Project({ useInMemoryFileSystem: true });
  const templateFile = project.createSourceFile("template.ts", template);
  const existingFile = project.createSourceFile("existing.ts", existing);
  const templateTest = getTestOptions(templateFile);
  const existingTest = getTestOptions(existingFile);
  if (!templateTest || !existingTest) {
    console.warn(
      "⚠ vitest.config.ts: no `defineConfig({ test })` found; left as it is.",
    );
    return existing;
  }
  for (const property of existingTest.getProperties()) {
    if (!Node.isPropertyAssignment(property)) {
      console.warn(
        `⚠ vitest.config.ts: \`${property.getText()}\` in \`test\` was dropped; re-add it by hand.`,
      );
      continue;
    }
    const name = property.getName();
    const initializer = property.getInitializerOrThrow();
    const templateProperty = templateTest.getProperty(name);
    const inTemplate = templateProperty !== undefined;
    if (inTemplate && !Node.isArrayLiteralExpression(initializer)) {
      warnIfOverridden(name, templateProperty, initializer);
      continue;
    }
    const imports = requiredImports(initializer);
    if (!imports) {
      console.warn(
        `⚠ vitest.config.ts: \`test.${name}\` uses code declared in the file and was dropped; re-add it by hand.`,
      );
      continue;
    }
    if (inTemplate) {
      if (!mergeArrayElements(templateTest, name, initializer)) {
        warnIfOverridden(name, templateProperty, initializer);
        continue;
      }
    } else {
      templateTest.insertPropertyAssignment(
        insertionIndex(templateTest, existingTest, property),
        {
          name,
          initializer: initializer.getText(),
          leadingTrivia: property
            .getLeadingCommentRanges()
            .map((comment) => `${comment.getText()}\n`)
            .join(""),
        },
      );
    }
    for (const required of imports) addImport(templateFile, required);
  }
  return templateFile.getFullText();
}
