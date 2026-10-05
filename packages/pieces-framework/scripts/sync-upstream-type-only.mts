// Ports typescript-eslint's consistent-type-imports (separate-type-imports)
// and consistent-type-exports fixes to ts-morph, then formats with prettier.
import fs from "node:fs";
import path from "node:path";
import * as prettier from "prettier";
import { Project, ts } from "ts-morph";

interface Edit {
  start: number;
  end: number;
  text: string;
}

// One report's edits, applied together or deferred together, like an ESLint fix.
type Fix = Edit[];

// ESLint's --fix pass limit.
const MAX_PASSES = 10;

export async function fixTypeOnlyAndFormat(
  tsconfig: string,
  dirs: string[],
): Promise<void> {
  const project = new Project({ tsConfigFilePath: tsconfig });
  const files = project.getSourceFiles().filter((file) => {
    const p = path.normalize(file.getFilePath());
    return p.endsWith(".ts") && dirs.some((d) => p.startsWith(d + path.sep));
  });

  for (let pass = 0; ; pass++) {
    if (pass === MAX_PASSES) {
      throw new Error(`type-only fixes did not settle in ${MAX_PASSES} passes`);
    }
    const checker = project.getTypeChecker().compilerObject;
    const pending = files.map((file) => ({
      file,
      fixes: [
        ...importFixes(file.compilerNode),
        ...exportFixes(file.compilerNode, checker),
      ],
    }));
    if (pending.every((p) => p.fixes.length === 0)) break;
    for (const { file, fixes } of pending) {
      if (fixes.length) {
        file.replaceWithText(applyFixes(file.getFullText(), fixes));
      }
    }
  }

  for (const file of files) {
    const filepath = file.getFilePath();
    const options = await prettier.resolveConfig(filepath, {
      editorconfig: true,
    });
    // Prettier is not always idempotent (member chains); rerun until stable.
    let text = file.getFullText();
    for (let pass = 0; ; pass++) {
      if (pass === MAX_PASSES) {
        throw new Error(`prettier did not settle on ${filepath}`);
      }
      const next = await prettier.format(text, { ...options, filepath });
      if (next === text) break;
      text = next;
    }
    fs.writeFileSync(filepath, text);
  }
}

// Non-overlapping fixes in range order; the rest wait for the next pass.
function applyFixes(text: string, fixes: Fix[]): string {
  const merged = fixes
    .map((edits) => {
      const start = Math.min(...edits.map((e) => e.start));
      const end = Math.max(...edits.map((e) => e.end));
      const sorted = [...edits].sort(
        (a, b) => b.start - a.start || b.end - a.end,
      );
      let slice = text.slice(start, end);
      for (const e of sorted) {
        slice =
          slice.slice(0, e.start - start) + e.text + slice.slice(e.end - start);
      }
      return { start, end, text: slice };
    })
    .sort((a, b) => a.start - b.start || a.end - b.end);
  let out = "";
  let pos = 0;
  let lastEnd = -Infinity;
  for (const m of merged) {
    if (lastEnd >= m.start) continue;
    out += text.slice(pos, m.start) + m.text;
    pos = m.end;
    lastEnd = m.end;
  }
  return out + text.slice(pos);
}

// Position of the next token at or after pos, skipping whitespace and comments.
function nextToken(text: string, pos: number): number {
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, true);
  scanner.setText(text, pos);
  scanner.scan();
  return scanner.getTokenStart();
}

// ---- consistent-type-imports ----------------------------------------------

type Specifier = ts.ImportSpecifier | ts.ImportClause | ts.NamespaceImport;

interface ImportReport {
  decl: ts.ImportDeclaration;
  typeSpecifiers: Set<Specifier>;
  valueCount: number;
  unusedCount: number;
}

function specifiersOf(decl: ts.ImportDeclaration): Specifier[] {
  const clause = decl.importClause;
  if (!clause) return [];
  const out: Specifier[] = [];
  if (clause.name) out.push(clause);
  const bindings = clause.namedBindings;
  if (bindings && ts.isNamespaceImport(bindings)) out.push(bindings);
  if (bindings && ts.isNamedImports(bindings)) out.push(...bindings.elements);
  return out;
}

function localName(spec: Specifier): ts.Identifier {
  return ts.isImportClause(spec) ? spec.name! : spec.name;
}

// Identifiers in the file that read the import's local binding.
function referencesOf(
  file: ts.SourceFile,
  binding: ts.Identifier,
): ts.Identifier[] {
  const refs: ts.Identifier[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isIdentifier(node) &&
      node !== binding &&
      node.text === binding.text &&
      isReference(node) &&
      !isShadowed(node)
    ) {
      refs.push(node);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return refs;
}

function isNameOf(p: ts.Node, id: ts.Identifier): boolean {
  return "name" in p && (p as { name?: ts.Node }).name === id;
}

// Whether an identifier reads a binding, rather than naming a member or declaration.
function isReference(id: ts.Identifier): boolean {
  const p = id.parent;
  if (ts.isPropertyAccessExpression(p)) return p.expression === id;
  if (ts.isQualifiedName(p)) return p.left === id;
  if (ts.isShorthandPropertyAssignment(p)) return true;
  if (ts.isExportSpecifier(p)) {
    if (p.parent.parent.moduleSpecifier) return false;
    return (p.propertyName ?? p.name) === id;
  }
  if (ts.isBindingElement(p)) return false;
  if (
    ts.isImportSpecifier(p) ||
    ts.isImportClause(p) ||
    ts.isNamespaceImport(p)
  ) {
    return false;
  }
  if (ts.isLabeledStatement(p) || ts.isBreakOrContinueStatement(p))
    return false;
  if (ts.isJsxAttribute(p)) return false;
  if (ts.isNamedTupleMember(p)) return p.name !== id;
  if (ts.isMetaProperty(p)) return false;
  return !isNameOf(p, id);
}

function bindsName(n: ts.Node | undefined, name: string): boolean {
  if (!n) return false;
  if (ts.isIdentifier(n)) return n.text === name;
  if (ts.isObjectBindingPattern(n) || ts.isArrayBindingPattern(n)) {
    return n.elements.some(
      (e) => ts.isBindingElement(e) && bindsName(e.name, name),
    );
  }
  return false;
}

function statementDeclares(
  s: ts.Statement,
  name: string,
  typeSpace: boolean,
): boolean {
  if (ts.isVariableStatement(s)) {
    return (
      !typeSpace &&
      s.declarationList.declarations.some((d) => bindsName(d.name, name))
    );
  }
  if (ts.isFunctionDeclaration(s)) return !typeSpace && s.name?.text === name;
  if (ts.isClassDeclaration(s) || ts.isEnumDeclaration(s))
    return s.name?.text === name;
  if (ts.isInterfaceDeclaration(s) || ts.isTypeAliasDeclaration(s)) {
    return typeSpace && s.name.text === name;
  }
  if (ts.isModuleDeclaration(s))
    return ts.isIdentifier(s.name) && s.name.text === name;
  return false;
}

// Whether a nearer declaration of the same name hides the import.
function declares(node: ts.Node, name: string, typeSpace: boolean): boolean {
  const typeParams = (
    node as { typeParameters?: ts.NodeArray<ts.TypeParameterDeclaration> }
  ).typeParameters;
  if (typeSpace && typeParams?.some((t) => t.name.text === name)) return true;
  if (ts.isFunctionLike(node)) {
    if (!typeSpace && node.parameters.some((p) => bindsName(p.name, name))) {
      return true;
    }
    if (
      !typeSpace &&
      (ts.isFunctionExpression(node) || ts.isClassExpression(node)) &&
      node.name?.text === name
    ) {
      return true;
    }
  }
  if (typeSpace && ts.isMappedTypeNode(node)) {
    return node.typeParameter.name.text === name;
  }
  if (typeSpace && ts.isConditionalTypeNode(node)) {
    let found = false;
    const visit = (n: ts.Node): void => {
      if (ts.isInferTypeNode(n) && n.typeParameter.name.text === name)
        found = true;
      ts.forEachChild(n, visit);
    };
    visit(node.extendsType);
    if (found) return true;
  }
  if (!typeSpace && ts.isCatchClause(node)) {
    return bindsName(node.variableDeclaration?.name, name);
  }
  if (
    !typeSpace &&
    (ts.isForStatement(node) ||
      ts.isForInStatement(node) ||
      ts.isForOfStatement(node)) &&
    node.initializer &&
    ts.isVariableDeclarationList(node.initializer)
  ) {
    return node.initializer.declarations.some((d) => bindsName(d.name, name));
  }
  if (ts.isBlock(node) || ts.isSourceFile(node) || ts.isModuleBlock(node)) {
    return node.statements.some((s) => statementDeclares(s, name, typeSpace));
  }
  if (ts.isCaseBlock(node)) {
    return node.clauses.some((c) =>
      c.statements.some((s) => statementDeclares(s, name, typeSpace)),
    );
  }
  return false;
}

function isShadowed(id: ts.Identifier): boolean {
  const typeSpace = isInTypeSpace(id);
  for (let n: ts.Node = id.parent; n; n = n.parent) {
    if (declares(n, id.text, typeSpace)) return true;
  }
  return false;
}

// Mirrors the scope manager: whether a reference sits in a type position.
function isInTypeSpace(id: ts.Identifier): boolean {
  let child: ts.Node = id;
  for (let n = id.parent; n; child = n, n = n.parent) {
    if (ts.isTypeQueryNode(n)) return false;
    if (ts.isExpressionWithTypeArguments(n) && n.expression === child) {
      const clause = n.parent;
      return !(
        ts.isHeritageClause(clause) &&
        clause.token === ts.SyntaxKind.ExtendsKeyword &&
        ts.isClassLike(clause.parent)
      );
    }
    if (ts.isTypeNode(n)) return true;
    if (ts.isComputedPropertyName(n)) return false;
    if (ts.isExpression(n) || ts.isStatement(n)) return false;
  }
  return false;
}

// Whether every reference still works with a type-only import.
function onlyTypeReferences(refs: ts.Identifier[]): boolean {
  return refs.every((ref) => {
    const p = ref.parent;
    if (ts.isExportSpecifier(p)) return p.parent.parent.isTypeOnly;
    if (ts.isExportAssignment(p)) return false;
    if (isInTypeSpace(ref)) return true;
    let child: ts.Node = ref;
    for (let n = ref.parent; n; child = n, n = n.parent) {
      if (ts.isTypeQueryNode(n)) return true;
      if (ts.isQualifiedName(n) && n.left === child) continue;
      if (ts.isPropertyAccessExpression(n) && n.expression === child) continue;
      if (ts.isComputedPropertyName(n)) {
        return ts.isPropertySignature(n.parent) && n.parent.name === n;
      }
      return false;
    }
    return false;
  });
}

function importFixes(file: ts.SourceFile): Fix[] {
  const typeOnlyNamed = new Map<string, ts.ImportDeclaration>();
  const reports: ImportReport[] = [];
  for (const decl of file.statements) {
    if (!ts.isImportDeclaration(decl)) continue;
    const source = (decl.moduleSpecifier as ts.StringLiteral).text;
    const specs = specifiersOf(decl);
    if (decl.importClause?.isTypeOnly) {
      if (!typeOnlyNamed.has(source) && specs.every(ts.isImportSpecifier)) {
        typeOnlyNamed.set(source, decl);
      }
      continue;
    }
    const report: ImportReport = {
      decl,
      typeSpecifiers: new Set(),
      valueCount: 0,
      unusedCount: 0,
    };
    for (const spec of specs) {
      if (ts.isImportSpecifier(spec) && spec.isTypeOnly) continue;
      const refs = referencesOf(file, localName(spec));
      if (refs.length === 0) report.unusedCount++;
      else if (onlyTypeReferences(refs)) report.typeSpecifiers.add(spec);
      else report.valueCount++;
    }
    const whole = report.valueCount === 0 && report.unusedCount === 0;
    if (report.typeSpecifiers.size && (!whole || !decl.attributes)) {
      reports.push(report);
    }
  }
  const text = file.getFullText();
  return reports.map((r) => importFix(file, text, r, typeOnlyNamed));
}

function importFix(
  file: ts.SourceFile,
  text: string,
  report: ImportReport,
  typeOnlyNamed: Map<string, ts.ImportDeclaration>,
): Fix {
  const { decl, typeSpecifiers } = report;
  const clause = decl.importClause!;
  const source = decl.moduleSpecifier.getText(file);
  const declStart = decl.getStart(file);
  const afterImport = declStart + "import".length;
  const insertType: Fix = [
    { start: afterImport, end: afterImport, text: " type" },
  ];
  const bindings = clause.namedBindings;
  const named =
    bindings && ts.isNamedImports(bindings) ? [...bindings.elements] : [];
  const namespace =
    bindings && ts.isNamespaceImport(bindings) ? bindings : undefined;
  const hasDefault = clause.name !== undefined;

  if (namespace && !hasDefault) return decl.attributes ? [] : insertType;
  if (hasDefault && typeSpecifiers.has(clause) && !named.length && !namespace) {
    return insertType;
  }
  if (!hasDefault && !namespace && named.every((s) => typeSpecifiers.has(s))) {
    return insertType;
  }

  const edits: Fix = [];
  const typeNamed = named.filter((s) => typeSpecifiers.has(s));
  if (typeNamed.length) {
    const open = (bindings as ts.NamedImports).getStart(file);
    const close = (bindings as ts.NamedImports).getEnd() - 1;
    const texts: string[] = [];
    if (typeNamed.length === named.length) {
      const comma = text.lastIndexOf(",", open);
      edits.push({ start: comma, end: close + 1, text: "" });
      texts.push(text.slice(open + 1, close));
    } else {
      const groups: ts.ImportSpecifier[][] = [];
      let group: ts.ImportSpecifier[] = [];
      for (const s of named) {
        if (typeSpecifiers.has(s)) group.push(s);
        else if (group.length) {
          groups.push(group);
          group = [];
        }
      }
      if (group.length) groups.push(group);
      for (const g of groups) {
        const first = g[0];
        const last = g[g.length - 1];
        const i = named.indexOf(first);
        const before = i === 0 ? open : nextToken(text, named[i - 1].end);
        const after = nextToken(text, last.end);
        const isEdge = i === 0 || last === named[named.length - 1];
        edits.push({
          start: text[before] === "," ? before : before + 1,
          end: isEdge && text[after] === "," ? after + 1 : last.end,
          text: "",
        });
        texts.push(text.slice(before + 1, after));
      }
    }
    const joined = texts.join(",");
    const target = typeOnlyNamed.get(
      (decl.moduleSpecifier as ts.StringLiteral).text,
    );
    if (target) {
      const tb = target.importClause!.namedBindings as ts.NamedImports;
      const tClose = tb.getEnd() - 1;
      const prev = text[text.slice(0, tClose).trimEnd().length - 1];
      const insert = prev === "," || prev === "{" ? joined : `,${joined}`;
      edits.push({ start: tClose, end: tClose, text: insert });
    } else {
      edits.push({
        start: declStart,
        end: declStart,
        text: `import type {${joined}} from ${source};\n`,
      });
    }
  }
  if (namespace && typeSpecifiers.has(namespace)) {
    const comma = text.lastIndexOf(",", namespace.getStart(file));
    edits.push({
      start: declStart,
      end: declStart,
      text: `import type ${namespace.getText(file)} from ${source};\n`,
    });
    edits.push({ start: comma, end: namespace.getEnd(), text: "" });
  }
  if (hasDefault && typeSpecifiers.has(clause)) {
    if (typeSpecifiers.size === specifiersOf(decl).length) {
      edits.push(...insertType);
    } else {
      const name = clause.name!;
      const comma = nextToken(text, name.getEnd());
      edits.push({
        start: declStart,
        end: declStart,
        text: `import type ${name.getText(file)} from ${source};\n`,
      });
      edits.push({
        start: name.getStart(file),
        end: nextToken(text, comma + 1),
        text: "",
      });
    }
  }
  return edits;
}

// ---- consistent-type-exports ----------------------------------------------

function isSymbolTypeBased(
  checker: ts.TypeChecker,
  symbol: ts.Symbol | undefined,
): boolean | undefined {
  if (!symbol || checker.isUnknownSymbol(symbol)) return undefined;
  if (symbol.getDeclarations()?.some(ts.isTypeOnlyImportOrExportDeclaration)) {
    return true;
  }
  if (symbol.flags & ts.SymbolFlags.Value) return false;
  return symbol.flags & ts.SymbolFlags.Alias
    ? isSymbolTypeBased(checker, checker.getImmediateAliasedSymbol(symbol))
    : true;
}

function exportFixes(file: ts.SourceFile, checker: ts.TypeChecker): Fix[] {
  const fixes: Fix[] = [];
  const text = file.getFullText();
  for (const decl of file.statements) {
    if (!ts.isExportDeclaration(decl) || decl.isTypeOnly) continue;
    const afterExport = decl.getStart(file) + "export".length;
    const clause = decl.exportClause;
    if (!clause || ts.isNamespaceExport(clause)) {
      if (!moduleExportsOnlyTypes(decl, checker)) continue;
      const star = text.indexOf("*", afterExport);
      fixes.push([{ start: star, end: star, text: "type " }]);
      continue;
    }
    const inlineType = clause.elements.filter((s) => s.isTypeOnly);
    const typeBased: ts.ExportSpecifier[] = [];
    const values: ts.ExportSpecifier[] = [];
    for (const spec of clause.elements) {
      if (spec.isTypeOnly) continue;
      const based = isSymbolTypeBased(
        checker,
        checker.getSymbolAtLocation(spec.name),
      );
      if (based === true) typeBased.push(spec);
      else if (based === false) values.push(spec);
    }
    if (!typeBased.length) continue;
    if (!values.length) {
      const edits: Fix = [
        { start: afterExport, end: afterExport, text: " type" },
      ];
      for (const s of inlineType) {
        const start = s.getStart(file);
        edits.push({
          start,
          end: nextToken(text, start + "type".length),
          text: "",
        });
      }
      fixes.push(edits);
      continue;
    }
    const specText = (s: ts.ExportSpecifier): string => {
      const local = (s.propertyName ?? s.name).getText(file);
      const exported = s.name.getText(file);
      return local === exported ? local : `${local} as ${exported}`;
    };
    const from =
      decl.moduleSpecifier && ts.isStringLiteral(decl.moduleSpecifier)
        ? ` from '${decl.moduleSpecifier.text}'`
        : "";
    const start = decl.getStart(file);
    fixes.push([
      {
        start: clause.getStart(file) + 1,
        end: clause.getEnd() - 1,
        text: ` ${values.map(specText).join(", ")} `,
      },
      {
        start,
        end: start,
        text: `export type { ${[...typeBased, ...inlineType].map(specText).join(", ")} }${from};\n`,
      },
    ]);
  }
  return fixes;
}

function moduleExportsOnlyTypes(
  decl: ts.ExportDeclaration,
  checker: ts.TypeChecker,
): boolean {
  const spec = decl.moduleSpecifier;
  if (!spec) return false;
  const target = checker.getSymbolAtLocation(spec)?.valueDeclaration;
  if (!target || !ts.isSourceFile(target)) return false;
  const fileSymbol = checker.getSymbolAtLocation(target);
  if (!fileSymbol) return false;
  const type = checker.getTypeOfSymbol(fileSymbol);
  return !checker
    .getPropertiesOfType(type)
    .some(
      (p) => checker.getPropertyOfType(type, p.escapedName.toString()) != null,
    );
}
