import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { ts } from "ts-morph";

export function importDirectionViolations(
  root: string,
  overlay: ReadonlyMap<string, string> = new Map(),
): string[] {
  const read = (file: string) =>
    overlay.get(file) ?? readFileSync(file, "utf8");
  const walk = (dir: string): string[] => [
    ...(existsSync(dir)
      ? readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
          entry.isDirectory()
            ? walk(join(dir, entry.name))
            : /\.[mc]?[jt]sx?$/.test(entry.name)
              ? [join(dir, entry.name)]
              : [],
        )
      : []),
    ...[...overlay.keys()].filter(
      (file) => dirname(file) === dir && !existsSync(file),
    ),
  ];
  const isTest = (file: string) =>
    /\.(test|spec)\.[mc]?[jt]sx?$/.test(file) || /__tests__/.test(file);
  const rel = (file: string) => relative(root, file).replaceAll("\\", "/");

  const dm = join(root, "packages/document-model/src");
  const ranks: Record<string, number> = {
    scalars: 0,
    kernel: 1,
    dsl: 2,
    compiler: 3,
    model: 4,
    runtime: 5,
    tooling: 6,
    entry: 7,
  };
  const layer = (file: string) => {
    const parts = relative(dm, file).split(/[\\/]/);
    if (parts[0] === "scalars") return "scalars";
    if (parts[0] !== "definition") return "outside";
    return parts.length === 2 && parts[1] === "index.ts" ? "entry" : parts[1];
  };
  const externalAllowed: Record<string, RegExp> = {
    scalars: /^(@powerhousedao\/shared(?:\/document-model)?|zod)$/,
    kernel: /^@powerhousedao\/shared\/document-model$/,
    dsl: /^(@powerhousedao\/shared\/document-model|zod)$/,
    compiler: /^(@powerhousedao\/shared\/document-model|zod|change-case)$/,
    model: /^@powerhousedao\/shared\/document-model$/,
    runtime: /^(@powerhousedao\/shared\/document-model|zod)$/,
    tooling:
      /^(node:.*|@powerhousedao\/shared(?:\/.*)?|graphql(?:\/.*)?|zod|remeda)$/,
    entry: /^$/,
  };
  const toolingSub = (file: string) => {
    const path = file.replaceAll("\\", "/");
    const nested =
      /packages\/document-model\/src\/definition\/tooling\/([^/]+)\//.exec(
        path,
      );
    if (nested) return nested[1];
    return /packages\/document-model\/src\/definition\/tooling\/[^/]+$/.test(
      path,
    )
      ? "root"
      : undefined;
  };
  const subRanks: Record<string, number> = {
    root: 0,
    graphql: 1,
    adapters: 2,
    report: 2,
    "schema-first": 2,
    check: 3,
    inspect: 3,
    release: 3,
    project: 4,
  };
  const cliRank = (file: string | undefined): [string, number] | undefined => {
    const match = /clis\/ph-cli\/src\/(.*)$/.exec(
      (file ?? "").replaceAll("\\", "/"),
    );
    if (!match) return undefined;
    const path = match[1];
    if (
      /^services\/package-build\/(pipeline\/|staging\/inventory\.ts$)/.test(
        path,
      )
    )
      return ["build-core", 0];
    if (
      /^services\/release\/(revision|approval|issuance|npm-args|scalar-bindings)\.ts$/.test(
        path,
      )
    )
      return ["release-pure", 0];
    if (/^services\/compiler-output\//.test(path))
      return ["compiler-output", 0];
    if (/^services\/package-build\/staging\//.test(path)) return ["staging", 1];
    if (/^services\/release\//.test(path)) return ["release", 1];
    if (/^services\/package-build\/steps\//.test(path)) return ["steps", 2];
    if (/^services\/(publish|model)\//.test(path))
      return [path.split("/")[1], 2];
    if (/^services\/(package-build\/run-build|build)\.ts$/.test(path))
      return ["run-build", 3];
    if (/^commands\//.test(path)) return ["commands", 4];
    return undefined;
  };
  const isCodeFirst = (path: string) =>
    (/^clis\/ph-cli\/src\//.test(path) ||
      /^packages\/codegen\/src\/.*(code-first|definition-source)/.test(path)) &&
    !/\/(?:model-generation|authoring-mode)\.ts$|\/schema-first\//.test(path);
  const isFlagSwitch = (file: string) =>
    /\/(?:model-generation|authoring-mode)\.ts$/.test(file);

  const generation = [
    ...walk(join(root, "packages/codegen/src")),
    ...walk(join(root, "clis/ph-cli/src")),
  ].filter((file) => !isTest(file));
  const generationSet = new Set(generation);
  const files = [
    ...walk(join(dm, "definition")),
    ...walk(join(dm, "scalars")),
    ...generation,
  ];

  const compilerOptions = new Map<string | undefined, ts.CompilerOptions>();
  const host: ts.ModuleResolutionHost = {
    ...ts.sys,
    fileExists: (file) => overlay.has(file) || ts.sys.fileExists(file),
    readFile: (file) => overlay.get(file) ?? ts.sys.readFile(file),
  };
  const resolveImport = (file: string, specifier: string) => {
    const configPath = ts.findConfigFile(dirname(file), (path) =>
      ts.sys.fileExists(path),
    );
    if (!compilerOptions.has(configPath)) {
      const config: unknown = configPath
        ? ts.readConfigFile(configPath, (path) => ts.sys.readFile(path)).config
        : {};
      compilerOptions.set(
        configPath,
        ts.parseJsonConfigFileContent(
          config,
          ts.sys,
          configPath ? dirname(configPath) : root,
        ).options,
      );
    }
    return ts.resolveModuleName(
      specifier,
      file,
      compilerOptions.get(configPath)!,
      host,
    ).resolvedModule?.resolvedFileName;
  };

  const errors: string[] = [];
  const fail = (file: string, specifier: string, why: string) =>
    errors.push(`${rel(file)} -> ${specifier}: ${why}`);
  const edges = new Map<string, Set<string>>();

  const specifierOf = (node: ts.Node): string | undefined => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    )
      return node.moduleSpecifier.text;
    if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) &&
          node.expression.text === "require")) &&
      node.arguments[0] &&
      ts.isStringLiteral(node.arguments[0])
    )
      return node.arguments[0].text;
    if (
      ts.isImportTypeNode(node) &&
      ts.isLiteralTypeNode(node.argument) &&
      ts.isStringLiteral(node.argument.literal)
    )
      return node.argument.literal.text;
    return undefined;
  };
  const importedNames = (node: ts.Node) => {
    const bindings = ts.isImportDeclaration(node)
      ? node.importClause?.namedBindings
      : undefined;
    return bindings && ts.isNamedImports(bindings)
      ? bindings.elements.map(
          (element) => element.propertyName?.text ?? element.name.text,
        )
      : undefined;
  };

  function checkImport(
    file: string,
    source: ts.SourceFile,
    node: ts.Node,
    specifier: string,
  ) {
    const target = resolveImport(file, specifier);
    const normalized = target?.replaceAll("\\", "/");
    const path = rel(file);
    if (specifier.startsWith(".") && target?.startsWith(dm)) {
      if (!edges.has(file)) edges.set(file, new Set());
      edges.get(file)!.add(target);
    }

    const from = layer(file);
    if (from !== "outside") {
      const to = target ? layer(target) : "outside";
      if (!(from in ranks)) fail(file, specifier, "unmapped definition layer");
      if (to !== "outside" && ranks[to] > ranks[from])
        fail(file, specifier, `${from} cannot import ${to}`);
      if (specifier === "change-case" && !file.endsWith("/compiler/naming.ts"))
        fail(file, specifier, "change-case belongs to naming only");
      if (from !== "tooling" && /^(node:|graphql$|ts-morph$)/.test(specifier))
        fail(file, specifier, "Node and heavy dependencies belong to tooling");
      if (from === "entry" && ts.isImportDeclaration(node))
        fail(file, specifier, "public entry is re-exports only");
      if (
        to === "outside" &&
        target?.startsWith(join(root, "packages/document-model/")) &&
        from !== "runtime" &&
        from !== "tooling"
      )
        fail(file, specifier, "only runtime/tooling can reach reducer runtime");
      if (!specifier.startsWith(".") && !target?.startsWith(dm)) {
        if (!externalAllowed[from]?.test(specifier))
          fail(file, specifier, "external import not allowed by layer");
        const clause = ts.isImportDeclaration(node)
          ? node.importClause
          : undefined;
        const typeOnly =
          clause?.isTypeOnly ||
          (clause?.namedBindings &&
            ts.isNamedImports(clause.namedBindings) &&
            clause.namedBindings.elements.every(
              (element) => element.isTypeOnly,
            ));
        if (
          specifier === "@powerhousedao/shared/document-model" &&
          !typeOnly &&
          !["runtime", "tooling", "entry"].includes(from) &&
          ts.isImportDeclaration(node)
        )
          fail(
            file,
            specifier,
            "lower layers import shared document-model types only",
          );
      }
    }

    if (generationSet.has(file)) {
      if (normalized?.includes("/packages/document-model/src/"))
        fail(file, specifier, "use public document-model entrypoints");
      if (file.includes("/packages/codegen/") && /ph-cli/.test(specifier))
        fail(file, specifier, "codegen cannot import CLI");
    }

    const fromSub = toolingSub(file);
    const toSub = normalized ? toolingSub(normalized) : undefined;
    if (fromSub && toSub) {
      if (!(fromSub in subRanks))
        fail(file, specifier, `unmapped tooling folder ${fromSub}`);
      else if (subRanks[toSub] > subRanks[fromSub])
        fail(
          file,
          specifier,
          `tooling/${fromSub} cannot import tooling/${toSub}`,
        );
    }
    if (fromSub && toSub === "release" && fromSub !== "release")
      fail(
        file,
        specifier,
        "only tooling/release imports tooling/release; check/ and inspect/ sit below it",
      );
    if (
      fromSub === "release" &&
      toSub !== undefined &&
      ["inspect", "project", "schema-first", "graphql"].includes(toSub)
    )
      fail(
        file,
        specifier,
        "tooling/release reads check types, report and adapters only",
      );

    const a = cliRank(file);
    const b = cliRank(normalized);
    if (a && b && b[1] > a[1])
      fail(
        file,
        specifier,
        `ph-cli ${a[0]} (rank ${a[1]}) cannot import ${b[0]} (rank ${b[1]})`,
      );
    if (
      a?.[0] === "publish" &&
      b &&
      ["steps", "run-build", "staging", "build-core", "model"].includes(b[0])
    )
      fail(file, specifier, "publish verifies through services/release only");
    if (
      a?.[0] === "model" &&
      b &&
      ["steps", "run-build", "staging", "build-core", "publish"].includes(b[0])
    )
      fail(
        file,
        specifier,
        "model reads the project and release; never the build or publish",
      );
    if (
      a?.[1] === 0 &&
      /^(node:)?(fs|fs\/promises|child_process|os)$/.test(specifier)
    )
      fail(
        file,
        specifier,
        "pure ph-cli module touches the filesystem or processes",
      );

    if (
      toSub === "schema-first" &&
      fromSub !== "schema-first" &&
      path !==
        "packages/document-model/src/definition/tooling/project/project-definitions.ts"
    )
      fail(
        file,
        specifier,
        "only tooling/project/project-definitions.ts may import tooling/schema-first",
      );
    if (
      fromSub !== undefined &&
      ["graphql", "report", "check", "inspect"].includes(fromSub) &&
      normalized &&
      /\/definition\/(runtime|model|subgraph)\//.test(normalized)
    )
      fail(
        file,
        specifier,
        `tooling/${fromSub} reads normalized artifacts, not runtime/model/subgraph`,
      );
    if (
      /^clis\/ph-cli\/src\/(commands\/model|services\/model\/)/.test(path) &&
      (specifier.includes("/schema-first") ||
        /adaptSchemaFirst/.test(node.getText(source)))
    )
      fail(file, specifier, "model commands read normalized artifacts only");

    const codeFirst = isCodeFirst(path) || /\/adapters\/code-first/.test(path);
    const names = importedNames(node);
    if (
      codeFirst &&
      normalized &&
      /\/file-builders\/document-model\/(?!code-first-)/.test(normalized)
    )
      fail(
        file,
        specifier,
        "code-first cannot import legacy schema-first model builders",
      );
    if (
      codeFirst &&
      normalized?.endsWith("/src/codegen/generate.ts") &&
      ts.isImportDeclaration(node)
    ) {
      const neutral = new Set([
        "generateAllApps",
        "generateAllPieces",
        "generateAllProcessors",
        "generateAllSubgraphs",
      ]);
      if (!names || names.some((name) => !neutral.has(name)))
        fail(
          file,
          specifier,
          "only neutral legacy generators may be imported by code-first core",
        );
    }
    if (codeFirst && names?.some((name) => name.startsWith("adaptSchemaFirst")))
      fail(
        file,
        specifier,
        "code-first cannot import schema-first through a barrel",
      );
    if (
      codeFirst &&
      normalized &&
      (/\/schema-first\//.test(normalized) ||
        /\/templates\/document-editor\/editor\.ts$/.test(normalized))
    )
      fail(
        file,
        specifier,
        "code-first cannot import schema-first-only implementation",
      );
    if (
      /\/adapters\/code-first/.test(path) &&
      normalized?.includes("/schema-first/")
    )
      fail(
        file,
        specifier,
        "code-first adapter cannot import schema-first adapter",
      );
  }

  function checkNode(file: string, source: ts.SourceFile, node: ts.Node) {
    const path = rel(file);
    const specifier = specifierOf(node);
    if (specifier) checkImport(file, source, node, specifier);
    if (generationSet.has(file) && !isFlagSwitch(file)) {
      if (
        ts.isBindingElement(node) &&
        (node.propertyName?.getText(source) ?? node.name.getText(source)) ===
          "codeFirst"
      )
        fail(
          file,
          "codeFirst",
          "raw flag destructuring belongs to the package switch",
        );
      if (ts.isPropertyAccessExpression(node) && node.name.text === "codeFirst")
        fail(
          file,
          "codeFirst",
          "raw flag access belongs to the package switch",
        );
    }
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "parseDefinitionSourcesConfig" &&
      ![
        "packages/codegen/src/codegen/model-generation.ts",
        "packages/codegen/src/file-builders/definition-sources.ts",
        "packages/document-model/src/definition/tooling/definition-source-resolution.ts",
      ].includes(path)
    )
      fail(
        file,
        "parseDefinitionSourcesConfig",
        "parse only at mode selection, registration, or source resolution boundaries",
      );
    if (
      ts.isIdentifier(node) &&
      node.text === "DEFAULT_AUTHORING_MODE" &&
      ![
        "packages/codegen/src/codegen/model-generation.ts",
        "packages/document-model/src/definition/tooling/definition-source-resolution.ts",
      ].includes(path)
    )
      fail(
        file,
        "DEFAULT_AUTHORING_MODE",
        "the shared default is read only by package switches",
      );
    if (
      ts.isImportDeclaration(node) &&
      ts.isStringLiteral(node.moduleSpecifier) &&
      node.moduleSpecifier.text.endsWith("/generate.js") &&
      !file.includes("/schema-first/")
    ) {
      const legacy = new Set([
        "generateDocumentModel",
        "generateAllDocumentModels",
        "generateEditor",
        "generateAllEditors",
        "generateAll",
        "generateFromFile",
      ]);
      if (importedNames(node)?.some((name) => legacy.has(name)))
        fail(
          file,
          node.moduleSpecifier.text,
          "legacy model/editor calls belong to schema-first boundary only",
        );
    }
    ts.forEachChild(node, (child) => checkNode(file, source, child));
  }

  for (const file of files) {
    const source = ts.createSourceFile(
      file,
      read(file),
      ts.ScriptTarget.Latest,
      true,
    );
    checkNode(file, source, source);
  }

  const cycleIn = (
    graph: Map<string, Set<string>>,
    report: (cycle: string[]) => void,
  ) => {
    const state = new Map<string, 1 | 2>();
    const stack: string[] = [];
    const visit = (file: string) => {
      state.set(file, 1);
      stack.push(file);
      for (const next of graph.get(file) ?? []) {
        if (state.get(next) === 1)
          report([...stack.slice(stack.indexOf(next)), next].map(rel));
        else if (!state.has(next)) visit(next);
      }
      stack.pop();
      state.set(file, 2);
    };
    for (const file of graph.keys()) if (!state.has(file)) visit(file);
  };
  cycleIn(edges, (cycle) => errors.push(`cycle: ${cycle.join(" -> ")}`));

  const hosts = [
    "packages/reactor-api/src",
    "packages/reactor-mcp/src",
    "packages/reactor-browser/src",
    "packages/reactor/src",
    "packages/reactor-workflow/src",
    "packages/workflow/pieces",
    "packages/vetra/src",
    "packages/vetra/processors",
    "apps/switchboard/src",
  ]
    .flatMap((directory) => walk(join(root, directory)))
    .filter((file) => !isTest(file));
  const selectors: Record<string, Set<string>> = {
    inspectDocumentModelDefinition: new Set([
      "packages/reactor-api/src/graphql/document-model-schema/source.ts",
      "packages/reactor-mcp/src/tools/model-operations.ts",
    ]),
    projectDocumentModelGraphQL: new Set([
      "packages/reactor-api/src/graphql/document-model-schema/source.ts",
    ]),
  };
  const hostFlags =
    /\b(definitionSources|DEFAULT_AUTHORING_MODE|parseDefinitionSourcesConfig|authoringMode)\b|compatibility\.(identity|serialization)/;
  const structured = [
    "packages/reactor-api/src/graphql/document-model-schema/structured-projection.ts",
    "packages/reactor-api/src/graphql/document-model-schema/package-scalars.ts",
  ];
  for (const file of hosts) {
    const path = rel(file);
    const text = read(file);
    for (const [name, allowed] of Object.entries(selectors))
      if (new RegExp(`\\b${name}\\b`).test(text) && !allowed.has(path))
        errors.push(
          `${path}: names ${name}; only ${[...allowed].join(", ")} selects native vs stored`,
        );
    const flag = hostFlags.exec(text);
    if (flag)
      errors.push(
        `${path}: reads ${flag[0]}; hosts choose the path from inspectDocumentModelDefinition, never from an authoring flag`,
      );
    if (/document-model\/(src|dist)\//.test(text))
      errors.push(`${path}: deep document-model path`);
    if (
      structured.includes(path) &&
      /\bspecifications\b|\.state\.\w+\.schema\b|parseSdl\s*\(/.test(text)
    )
      errors.push(`${path}: the structured path reads the stored model's SDL`);
  }

  const modeFlags =
    /\b(DEFAULT_AUTHORING_MODE|parseDefinitionSourcesConfig|authoringMode)\b|sourceSet\.mode|compatibility\.(identity|serialization)/;
  for (const dir of ["package-build", "release", "publish"])
    for (const file of walk(join(root, "clis/ph-cli/src/services", dir))) {
      const flag = modeFlags.exec(read(file));
      if (flag)
        errors.push(
          `${rel(file)}: reads ${flag[0]}; build, release and publish never branch on authoring mode`,
        );
    }

  const roots = ["clis/ph-cli/src", "packages/reactor-api/src"].map((dir) =>
    join(root, dir),
  );
  const edgeFiles = roots
    .flatMap(walk)
    .filter((file) => !isTest(file) && !/\.d\.[mc]?ts$/.test(file));
  const valueGraph = new Map<string, Set<string>>();
  for (const file of edgeFiles) {
    const source = ts.createSourceFile(
      file,
      read(file),
      ts.ScriptTarget.Latest,
      true,
    );
    const visit = (node: ts.Node) => {
      if (
        (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
        node.moduleSpecifier &&
        ts.isStringLiteral(node.moduleSpecifier) &&
        !(ts.isImportDeclaration(node) && node.importClause?.isTypeOnly) &&
        !(ts.isExportDeclaration(node) && node.isTypeOnly) &&
        node.moduleSpecifier.text.startsWith(".")
      ) {
        const target = resolveImport(file, node.moduleSpecifier.text);
        if (target && roots.some((dir) => target.startsWith(dir + "/"))) {
          if (!valueGraph.has(file)) valueGraph.set(file, new Set());
          valueGraph.get(file)!.add(target);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  const governed =
    /clis\/ph-cli\/src\/services\/(package-build|release|model)\/|clis\/ph-cli\/src\/services\/build\.ts|packages\/reactor-api\/src\/packages\/host-validation\.ts|graphql\/document-model-schema\//;
  const seen = new Set<string>();
  cycleIn(valueGraph, (cycle) => {
    const key = [...cycle.slice(0, -1)].sort().join("|");
    if (seen.has(key)) return;
    seen.add(key);
    const line = cycle.join(" -> ");
    if (governed.test(line))
      errors.push(`cycle (static, value imports): ${line}`);
  });

  const pure =
    /^clis\/ph-cli\/src\/services\/(package-build\/pipeline\/|package-build\/staging\/(inventory|compiler-output)\.ts$|release\/(revision|approval|issuance|npm-args|scalar-bindings)\.ts$|compiler-output\/)/;
  for (const file of edgeFiles) {
    if (!pure.test(rel(file))) continue;
    const code = read(file).replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, "");
    if (/\bprocess\s*\.|from\s+["'](node:)?process["']/.test(code))
      errors.push(`${rel(file)}: pure module reads process state`);
  }

  return errors;
}
