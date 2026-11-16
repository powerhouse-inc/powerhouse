import { projectFiles } from "@powerhousedao/shared/clis";
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
  return projectFiles.read(filePath);
}

const normalizeEntry = (entry: string) =>
  entry.replace(/^\.\//, "").replace(/\/$/, "");

function jsonRoot(
  file: ts.JsonSourceFile,
): ts.ObjectLiteralExpression | undefined {
  const root = file.statements[0]?.expression;
  return root && ts.isObjectLiteralExpression(root) ? root : undefined;
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

/** An array of a JSON config file whose entries the template adds to. */
export type MergedJsonArray = {
  keyPath: readonly string[];
  // Entries earlier templates shipped and the current one removed.
  dropped?: readonly string[];
};

type Insertion = { pos: number; text: string };

/* After the last entry of an object or array, minding a trailing comma */
function appended(list: ts.NodeArray<ts.Node>, text: string): Insertion {
  const last = list.at(-1);
  if (!last) return { pos: list.pos, text };
  return list.hasTrailingComma
    ? { pos: list.end, text: `${text},` }
    : { pos: last.end, text: `,${text}` };
}

/* The project's text without the dropped entries of the listed arrays */
function withoutDroppedEntries(
  fileName: string,
  existing: string,
  arrays: readonly MergedJsonArray[],
): string {
  let text = existing;
  for (const { keyPath, dropped = [] } of arrays) {
    const names = dropped.map(normalizeEntry);
    if (names.length === 0) continue;
    // One entry a pass: a removal moves every position after it.
    for (;;) {
      const file = ts.parseJsonText(fileName, text);
      const elements = jsonArrayNodeAt(file, keyPath)?.elements;
      const index =
        elements?.findIndex(
          (e) =>
            ts.isStringLiteral(e) && names.includes(normalizeEntry(e.text)),
        ) ?? -1;
      if (!elements || index === -1) break;
      const entry = elements[index];
      const next = elements.at(index + 1);
      const previous = index > 0 ? elements[index - 1] : undefined;
      // With its comma: the one after it, or the one before a last entry.
      let pos = entry.getStart(file);
      let end = entry.end;
      if (next) end = next.getStart(file);
      else if (previous) pos = previous.end;
      else end = elements.end;
      console.log(
        `  ${fileName}: removed ${entry.getText(file)} from ${keyPath.join(".")}; the template dropped it`,
      );
      text = text.slice(0, pos) + text.slice(end);
    }
  }
  return text;
}

function collectMissingEntries(
  project: ts.ObjectLiteralExpression,
  wanted: ts.ObjectLiteralExpression,
  template: string,
  arrays: readonly MergedJsonArray[],
  keyPath: readonly string[],
  insertions: Insertion[],
) {
  const missing: string[] = [];
  for (const property of wanted.properties) {
    if (!ts.isPropertyAssignment(property)) continue;
    if (!ts.isStringLiteral(property.name)) continue;
    const name = property.name.text;
    const path = [...keyPath, name];
    const own = project.properties
      .filter(ts.isPropertyAssignment)
      .find((p) => ts.isStringLiteral(p.name) && p.name.text === name);
    if (!own) {
      // From the end of the entry before it: its comment comes along.
      missing.push(template.slice(property.pos, property.end));
      continue;
    }
    const value = own.initializer;
    const templateValue = property.initializer;
    if (
      ts.isObjectLiteralExpression(value) &&
      ts.isObjectLiteralExpression(templateValue)
    ) {
      collectMissingEntries(
        value,
        templateValue,
        template,
        arrays,
        path,
        insertions,
      );
      continue;
    }
    const array = arrays.find((a) => a.keyPath.join("\n") === path.join("\n"));
    if (
      !array ||
      !ts.isArrayLiteralExpression(value) ||
      !ts.isArrayLiteralExpression(templateValue)
    ) {
      // The project's value stays.
      continue;
    }
    const known = [
      ...value.elements
        .filter(ts.isStringLiteral)
        .map((e) => normalizeEntry(e.text)),
      ...(array.dropped ?? []).map(normalizeEntry),
    ];
    const entries = templateValue.elements
      .filter(ts.isStringLiteral)
      .map((e) => e.text)
      .filter((entry) => !known.includes(normalizeEntry(entry)));
    if (entries.length === 0) continue;
    insertions.push(
      appended(
        value.elements,
        entries.map((entry) => ` ${JSON.stringify(entry)}`).join(","),
      ),
    );
  }
  if (missing.length > 0) {
    insertions.push(appended(project.properties, missing.join(",")));
  }
}

/** The project's JSON(C) config file with what it lacks of the template: the
 * keys it does not set, and the template's entries of each listed array. The
 * project's own values and comments stay. The template when the project has
 * no file; undefined when nothing changes or the file can't be read. */
export function withTemplateEntries(
  fileName: string,
  template: string,
  existing: string | undefined,
  arrays: readonly MergedJsonArray[] = [],
): string | undefined {
  if (existing === undefined) return template;
  if (ts.parseConfigFileTextToJson(fileName, existing).error) {
    console.warn(`⚠ ${fileName}: could not be read as JSON; left as it is.`);
    return undefined;
  }
  const text = withoutDroppedEntries(fileName, existing, arrays);
  const project = jsonRoot(ts.parseJsonText(fileName, text));
  const wanted = jsonRoot(ts.parseJsonText(fileName, template));
  if (!project || !wanted) {
    console.warn(`⚠ ${fileName}: is not a JSON object; left as it is.`);
    return undefined;
  }
  const insertions: Insertion[] = [];
  collectMissingEntries(project, wanted, template, arrays, [], insertions);
  const merged = insertions
    .sort((a, b) => b.pos - a.pos)
    .reduce(
      (result, insertion) =>
        result.slice(0, insertion.pos) +
        insertion.text +
        result.slice(insertion.pos),
      text,
    );
  return merged === existing ? undefined : merged;
}

function getConfigOptions(sourceFile: SourceFile) {
  const config = sourceFile
    .getDescendantsOfKind(SyntaxKind.CallExpression)
    .find((call) => call.getExpression().getText() === "defineConfig")
    ?.getArguments()
    .at(0);
  return Node.isObjectLiteralExpression(config) ? config : undefined;
}

function hasTestOptions(config: ObjectLiteralExpression) {
  const test = config.getProperty("test");
  return (
    Node.isPropertyAssignment(test) &&
    Node.isObjectLiteralExpression(test.getInitializer())
  );
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

/* Right after the template's copy of the option that precedes it in the project */
function insertionIndex(
  target: ObjectLiteralExpression,
  source: ObjectLiteralExpression,
  property: ObjectLiteralElementLike,
) {
  // Insertion counts a comment on its own line as a member.
  const names = target
    .getPropertiesWithComments()
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

/* Vite reads the tsconfig's paths itself (resolve.tsconfigPaths); the plugin
   warns that it does. */
const SUPERSEDED_PLUGINS = ["tsconfigPaths()"];

/* The nodes of an option that move to the template: all of it, or for
   `plugins` the entries the template's options don't replace. */
function movedNodes(option: string, initializer: Node): Node[] {
  if (option !== "plugins" || !Node.isArrayLiteralExpression(initializer)) {
    return [initializer];
  }
  return initializer
    .getElements()
    .filter((e) => !SUPERSEDED_PLUGINS.includes(withoutSpace(e.getText())));
}

/* A property's leading comments, less those the template already carries */
const leadingComments = (property: Node, known: string[] = []) =>
  property
    .getLeadingCommentRanges()
    .map((comment) => comment.getText())
    .filter((comment) => !known.includes(comment))
    .map((comment) => comment + "\n")
    .join("");

/* Adds the project's options to the template's: an option the template lacks
   moves over, arrays gain the project's entries, objects merge key by key and
   any other value stays the project's. */
function mergeOptions(
  templateFile: SourceFile,
  target: ObjectLiteralExpression,
  source: ObjectLiteralExpression,
  path: string[],
  parentComments: string,
) {
  let comments = parentComments;
  for (const property of source.getProperties()) {
    if (!Node.isPropertyAssignment(property)) {
      console.warn(
        `⚠ vitest.config.ts: \`${property.getText()}\` in \`${path.join(".") || "defineConfig"}\` was dropped; re-add it by hand.`,
      );
      continue;
    }
    const name = property.getName();
    const option = [...path, name].join(".");
    const initializer = property.getInitializerOrThrow();
    const templateProperty = target.getProperty(name);
    const templateValue = Node.isPropertyAssignment(templateProperty)
      ? templateProperty.getInitializer()
      : undefined;
    if (
      Node.isObjectLiteralExpression(templateValue) &&
      Node.isObjectLiteralExpression(initializer)
    ) {
      mergeOptions(
        templateFile,
        templateValue,
        initializer,
        [...path, name],
        leadingComments(
          property,
          templateProperty
            ?.getLeadingCommentRanges()
            .map((comment) => comment.getText()),
        ),
      );
      continue;
    }
    const moved = movedNodes(option, initializer);
    if (moved.length === 0) continue;
    const value =
      moved[0] === initializer
        ? initializer.getText()
        : `[${moved.map((node) => node.getText()).join(", ")}]`;
    const imports: RequiredImport[] = [];
    let ownCode = false;
    for (const node of moved) {
      const required = requiredImports(node);
      if (required) imports.push(...required);
      else ownCode = true;
    }
    if (ownCode) {
      console.warn(
        `⚠ vitest.config.ts: \`${option}\` uses code declared in the file and was dropped; re-add it by hand.`,
      );
      continue;
    }
    if (templateProperty === undefined) {
      target.insertPropertyAssignment(
        insertionIndex(target, source, property),
        {
          name,
          initializer: value,
          leadingTrivia: comments + leadingComments(property),
        },
      );
      comments = "";
    } else if (!mergeArrayElements(target, name, initializer)) {
      if (
        !Node.isPropertyAssignment(templateProperty) ||
        !templateValue ||
        withoutSpace(templateValue.getText()) === withoutSpace(value)
      ) {
        continue;
      }
      console.log(
        `  vitest.config.ts: kept the project's \`${option}: ${value}\`; the template has \`${templateValue.getText()}\``,
      );
      templateProperty.setInitializer(value);
    }
    for (const required of imports) addImport(templateFile, required);
  }
}

/** The template vitest.config.ts plus the project's own options and their
 * imports; the project's file as it is when those can't be read. */
export function mergedVitestConfig(
  template: string,
  existing: string | undefined,
): string {
  if (existing === undefined) return template;
  const project = new Project({ useInMemoryFileSystem: true });
  const templateFile = project.createSourceFile("template.ts", template);
  const existingFile = project.createSourceFile("existing.ts", existing);
  const templateConfig = getConfigOptions(templateFile);
  const existingConfig = getConfigOptions(existingFile);
  if (
    !templateConfig ||
    !existingConfig ||
    !hasTestOptions(templateConfig) ||
    !hasTestOptions(existingConfig)
  ) {
    console.warn(
      "⚠ vitest.config.ts: no `defineConfig({ test })` found; left as it is.",
    );
    return existing;
  }
  mergeOptions(templateFile, templateConfig, existingConfig, [], "");
  return templateFile.getFullText();
}

export type JsonObject = { [key: string]: unknown };

const isJsonObject = (value: unknown): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/* Missing keys come from `owned`; arrays gain its entries; the project's scalars win. */
function withOwnedKeys(project: JsonObject, owned: JsonObject): JsonObject {
  const result = { ...project };
  for (const [key, value] of Object.entries(owned)) {
    const current = result[key];
    if (current === undefined) {
      result[key] = value;
    } else if (Array.isArray(value)) {
      const entries = Array.isArray(current)
        ? (current as unknown[])
        : [current];
      const added = (value as unknown[]).filter((v) => !entries.includes(v));
      result[key] = [...entries, ...added];
    } else if (isJsonObject(value) && isJsonObject(current)) {
      result[key] = withOwnedKeys(current, value);
    }
  }
  return result;
}

/* Arrays and objects the removal empties go too. */
function withoutEntries(project: JsonObject, removed: JsonObject): JsonObject {
  const result = { ...project };
  for (const [key, value] of Object.entries(removed)) {
    const current = result[key];
    let kept: unknown[] | JsonObject;
    if (Array.isArray(value) && Array.isArray(current)) {
      kept = current.filter((entry) => !value.includes(entry));
      if (kept.length === current.length) continue;
      if (kept.length === 0) delete result[key];
      else result[key] = kept;
    } else if (isJsonObject(value) && isJsonObject(current)) {
      kept = withoutEntries(current, value);
      if (Object.keys(kept).length === 0 && Object.keys(current).length > 0) {
        delete result[key];
      } else {
        result[key] = kept;
      }
    }
  }
  return result;
}

/** The project's JSON settings with the `owned` keys merged in and the
 * `obsolete` entries removed; undefined when nothing changes or the file
 * can't be read. */
export function mergedJsonSettings(
  fileName: string,
  existing: string,
  owned: JsonObject,
  obsolete: JsonObject = {},
): string | undefined {
  // TypeScript asserts its file names use forward slashes.
  const parsed = ts.parseConfigFileTextToJson(
    fileName.replaceAll("\\", "/"),
    existing,
  );
  if (parsed.error || !isJsonObject(parsed.config)) {
    console.warn(`⚠ ${fileName}: could not be read as JSON; left as it is.`);
    return undefined;
  }
  const merged = withoutEntries(withOwnedKeys(parsed.config, owned), obsolete);
  const text = JSON.stringify(merged, null, 2);
  return text === JSON.stringify(parsed.config, null, 2)
    ? undefined
    : `${text}\n`;
}
