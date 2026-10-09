// `runBuild` end to end on the fixtures under test/fixtures, built in place
// the way `ph build` builds a project, every step running for every one.

import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { isBuiltin } from "node:module";
import { delimiter, join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  generatePiece,
  generatePieceAction,
  generatePieceTrigger,
} from "@powerhousedao/codegen";
import { buildTsMorphProject } from "@powerhousedao/codegen/utils";
import type { Manifest } from "@powerhousedao/shared/document-model";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { runBuild } from "../src/services/build.js";
import type { BuildArgs } from "../src/types.js";

const fixtures = join(import.meta.dirname, "fixtures");
const originalCwd = process.cwd();

const args = {
  outDir: "dist",
  noSharedDeps: false,
  debug: undefined,
} as BuildArgs;

const readJson = <T>(file: string): T =>
  JSON.parse(readFileSync(file, "utf8")) as T;

// Every specifier the built module still imports; a self-contained piece has
// none but node built-ins.
function bareImports(bundle: string): string[] {
  // Inlined dependencies keep JSDoc like `@type {import('./eval')}`
  const source = bundle.replace(/\/\*[\s\S]*?\*\//g, "");
  const found: string[] = [];
  for (const match of source.matchAll(/from\s+["']([^"']+)["']/g)) {
    found.push(match[1]);
  }
  for (const match of source.matchAll(/import\(\s*["']([^"']+)["']\s*\)/g)) {
    found.push(match[1]);
  }
  // isBuiltin, not a "node:" prefix test: a bundled dependency may import a
  // builtin bare ("crypto"), which a host resolves and a piece may keep.
  return found.filter((spec) => !isBuiltin(spec));
}

function clean(fixture: string) {
  rmSync(join(fixture, "dist"), { recursive: true, force: true });
  for (const entry of readdirSync(fixture)) {
    if (entry.endsWith(".tsbuildinfo")) rmSync(join(fixture, entry));
  }
}

let warnings: string[];

// The fixtures are plain directories with no node_modules, so the build's last
// step finds no `tailwindcss` binary to run.

// Standing one on PATH keeps the run whole and still proves what ph-cli owns
// here: that the step is invoked with the right input and output paths.
//
// The stub's work lives in a .mjs file that both entry points hand to node:
// a lone `#!/bin/sh` script is unreachable on Windows, which resolves a bare
// `tailwindcss` only through PATHEXT (.cmd among them, no extension never).
let stubDir: string;

beforeAll(() => {
  stubDir = mkdtempSync(join(tmpdir(), "ph-tailwind-stub-"));

  writeFileSync(
    join(stubDir, "tailwindcss.mjs"),
    [
      'import { mkdirSync, writeFileSync } from "node:fs";',
      'import { dirname } from "node:path";',
      "const argv = process.argv.slice(2);",
      'const out = argv[argv.indexOf("-o") + 1];',
      'if (argv.includes("-o") && out) {',
      "  mkdirSync(dirname(out), { recursive: true });",
      '  writeFileSync(out, "/* stub */\\n");',
      "}",
      "",
    ].join("\n"),
  );

  const posix = join(stubDir, "tailwindcss");
  writeFileSync(
    posix,
    `#!/bin/sh\nexec node "$(dirname "$0")/tailwindcss.mjs" "$@"\n`,
  );
  chmodSync(posix, 0o755);

  // PATHEXT makes this the one Windows actually runs; harmless elsewhere.
  writeFileSync(
    join(stubDir, "tailwindcss.cmd"),
    '@echo off\r\nnode "%~dp0tailwindcss.mjs" %*\r\n',
  );

  process.env.PATH = `${stubDir}${delimiter}${process.env.PATH ?? ""}`;
});

afterAll(() => {
  rmSync(stubDir, { recursive: true, force: true });
});

beforeEach(() => {
  warnings = [];
  vi.spyOn(console, "warn").mockImplementation((...parts: unknown[]) => {
    const message = parts.map(String).join(" ");
    // Rolldown's timing advice depends on the machine, not on the build.
    if (!message.includes("[PLUGIN_TIMINGS]")) warnings.push(message);
  });
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  process.chdir(originalCwd);
  vi.restoreAllMocks();
});

describe("runBuild on a piece-only package", () => {
  const fixture = join(fixtures, "piece-only-package");
  const dist = join(fixture, "dist");
  const sourceManifest = join(fixture, "powerhouse.manifest.json");

  it("builds each piece self-contained, describes it and lists it in the dist manifest", async () => {
    const manifestBefore = readFileSync(sourceManifest);
    clean(fixture);
    process.chdir(fixture);

    await runBuild(args);

    // The empty bareImports below only bites because a piece really imports a
    // package the node build externalizes; zod is in the shared external set.
    expect(
      readFileSync(
        join(fixture, "pieces", "hello", "lib", "greeting.ts"),
        "utf8",
      ),
    ).toContain('from "zod"');

    // The list, and one directory per listed piece, each holding one module.
    expect(existsSync(join(dist, "node", "pieces", "index.mjs"))).toBe(true);
    for (const dir of ["hello", "goodbye"]) {
      const pieceDir = join(dist, "node", "pieces", dir);
      expect(readdirSync(pieceDir).sort()).toEqual([
        "descriptor.json",
        "index.mjs",
        "package.json",
      ]);
      const module = readFileSync(join(pieceDir, "index.mjs"), "utf8");
      expect(bareImports(module)).toEqual([]);
    }

    // The dynamic import and the cross-piece helper were inlined, not chunked.
    const hello = readFileSync(
      join(dist, "node", "pieces", "hello", "index.mjs"),
      "utf8",
    );
    expect(hello).toContain("toUpperCase");
    expect(
      readdirSync(join(dist, "node", "pieces")).filter((f) =>
        f.endsWith(".mjs"),
      ),
    ).toEqual(["index.mjs"]);

    // The descriptor: the list's name, the package's version, the piece's metadata,
    // and none of the functions a prop or an action carries.
    type Descriptor = {
      name: string;
      version: string;
      displayName: string;
      description: string;
      actions: Record<
        string,
        {
          displayName: string;
          props: Record<string, Record<string, unknown>>;
          run?: unknown;
        }
      >;
      triggers: Record<string, unknown>;
    };
    const helloDescriptor = readJson<Descriptor>(
      join(dist, "node", "pieces", "hello", "descriptor.json"),
    );
    expect(helloDescriptor.name).toBe("@fixture/piece-hello");
    expect(helloDescriptor.version).toBe("1.2.3");
    expect(helloDescriptor.displayName).toBe("Hello");
    expect(helloDescriptor.actions.say_hello.props.who).toEqual({
      type: "SHORT_TEXT",
      displayName: "Who",
      required: true,
    });
    expect(helloDescriptor.actions.say_hello).not.toHaveProperty("run");
    expect(helloDescriptor.triggers).toEqual({});

    // The metadata() path: the piece's own method was used.
    const goodbyeDescriptor = readJson<Descriptor & { deprecated: boolean }>(
      join(dist, "node", "pieces", "goodbye", "descriptor.json"),
    );
    expect(goodbyeDescriptor.name).toBe("@fixture/piece-goodbye");
    expect(goodbyeDescriptor.version).toBe("1.2.3");
    expect(goodbyeDescriptor.displayName).toBe("Goodbye");
    expect(goodbyeDescriptor.deprecated).toBe(false);
    expect(goodbyeDescriptor.actions.say_hello.displayName).toBe("Say goodbye");

    // The package.json beside the piece: npm-bundle shape, nothing to install.
    const pkg = readJson<Record<string, unknown>>(
      join(dist, "node", "pieces", "hello", "package.json"),
    );
    expect(pkg).toEqual({
      name: "@fixture/piece-hello",
      version: "1.2.3",
      description: "Says hello.",
      type: "module",
      main: "index.mjs",
      license: "MIT",
      dependencies: {},
    });

    // The dist manifest lists what was built; the source is untouched.
    const manifest = readJson<Manifest>(join(dist, "powerhouse.manifest.json"));
    expect(manifest.pieces).toEqual([
      {
        id: "@fixture/piece-hello",
        name: "Hello",
        version: "1.2.3",
        description: "Says hello.",
        bundle: "dist/node/pieces/hello",
        descriptor: "dist/node/pieces/hello/descriptor.json",
      },
      { id: "@fixture/piece-ghost", name: "Ghost" },
      {
        id: "@fixture/piece-goodbye",
        name: "Goodbye",
        version: "1.2.3",
        description: "Says goodbye.",
        bundle: "dist/node/pieces/goodbye",
        descriptor: "dist/node/pieces/goodbye/descriptor.json",
      },
    ]);
    expect(manifest.name).toBe("@fixture/piece-only-package");
    expect(manifest.documentModels).toEqual([]);
    expect(readFileSync(sourceManifest).equals(manifestBefore)).toBe(true);

    // The boilerplate steps run here like anywhere else: a browser bundle,
    // a stylesheet at the path the step names, and the types.
    expect(existsSync(join(dist, "browser", "index.js"))).toBe(true);
    expect(
      existsSync(join(dist, "browser", "document-models", "index.js")),
    ).toBe(true);
    // The stylesheet lands where the step was told to write it. What Tailwind
    // itself emits is Tailwind's business, and the fixture stands in for it.
    expect(existsSync(join(dist, "style.css"))).toBe(true);
    expect(existsSync(join(dist, "types", "index.d.ts"))).toBe(true);
    expect(
      existsSync(join(dist, "types", "pieces", "hello", "index.d.ts")),
    ).toBe(true);

    // The two things worth a warning, and nothing else.
    expect(warnings).toEqual([
      "⚠ pieces: pieces/orphan was built but pieces/index.ts does not list it; a host will not find it",
      '⚠ manifest lists piece "@fixture/piece-ghost" but nothing built it',
    ]);
  }, 120_000);
});

describe("runBuild on a mixed package", () => {
  const fixture = join(fixtures, "mixed-package");
  const dist = join(fixture, "dist");

  it("builds browser and node modules beside the piece and adds the piece to the manifest", async () => {
    clean(fixture);
    process.chdir(fixture);

    await runBuild(args);

    expect(
      existsSync(join(dist, "browser", "document-models", "index.js")),
    ).toBe(true);
    expect(existsSync(join(dist, "browser", "index.js"))).toBe(true);
    expect(existsSync(join(dist, "node", "document-models", "index.mjs"))).toBe(
      true,
    );
    expect(existsSync(join(dist, "node", "pieces", "index.mjs"))).toBe(true);
    expect(
      existsSync(join(dist, "types", "document-models", "index.d.ts")),
    ).toBe(true);
    // The stylesheet lands where the step was told to write it. What Tailwind
    // itself emits is Tailwind's business, and the fixture stands in for it.
    expect(existsSync(join(dist, "style.css"))).toBe(true);

    const pieceDir = join(dist, "node", "pieces", "wave");
    expect(readdirSync(pieceDir).sort()).toEqual([
      "descriptor.json",
      "index.mjs",
      "package.json",
    ]);
    expect(
      bareImports(readFileSync(join(pieceDir, "index.mjs"), "utf8")),
    ).toEqual([]);

    // No source entry to replace: the built piece is appended.
    const manifest = readJson<Manifest>(join(dist, "powerhouse.manifest.json"));
    expect(manifest.documentModels).toEqual([
      { id: "fixture/thing", name: "Thing" },
    ]);
    expect(manifest.pieces).toEqual([
      {
        id: "@fixture/mixed-package",
        name: "Wave",
        version: "2.0.0",
        description: "Waves.",
        bundle: "dist/node/pieces/wave",
        descriptor: "dist/node/pieces/wave/descriptor.json",
      },
    ]);
    expect(warnings).toEqual([]);
  }, 120_000);
});

// The common case, and the one this work must leave alone: no pieces/ at all,
// so nothing the piece pass does may show up in the output or the manifest.
describe("runBuild on a package with no pieces", () => {
  const fixture = join(fixtures, "classic-package");
  const dist = join(fixture, "dist");
  const sourceManifest = join(fixture, "powerhouse.manifest.json");

  it("builds browser, node, types and the stylesheet, and copies the manifest", async () => {
    clean(fixture);
    process.chdir(fixture);

    await runBuild(args);

    expect(existsSync(join(dist, "browser", "index.js"))).toBe(true);
    expect(
      existsSync(join(dist, "browser", "document-models", "index.js")),
    ).toBe(true);
    expect(existsSync(join(dist, "browser", "editors", "index.js"))).toBe(true);
    expect(existsSync(join(dist, "node", "index.mjs"))).toBe(true);
    expect(existsSync(join(dist, "types", "index.d.ts"))).toBe(true);
    // The stylesheet lands where the step was told to write it. What Tailwind
    // itself emits is Tailwind's business, and the fixture stands in for it.
    expect(existsSync(join(dist, "style.css"))).toBe(true);

    // No piece directory, and the manifest copy is the source byte for byte.
    expect(existsSync(join(dist, "node", "pieces"))).toBe(false);
    expect(
      readFileSync(join(dist, "powerhouse.manifest.json")).equals(
        readFileSync(sourceManifest),
      ),
    ).toBe(true);
    expect(
      readJson<Manifest>(join(dist, "powerhouse.manifest.json")),
    ).not.toHaveProperty("pieces");
    expect(warnings).toEqual([]);
  }, 120_000);
});

// Nothing under pieces/<dir>, so nothing is bundled; the built list is still
// there, and what it declares is still the build's to check.
describe("runBuild on a package that only lists a piece", () => {
  const fixture = join(fixtures, "listed-only-package");

  it("fails, naming the piece the list declares and nothing built", async () => {
    clean(fixture);
    process.chdir(fixture);

    await expect(runBuild(args)).rejects.toThrow(
      'pieces: "@fixture/piece-gone" declares dist/node/pieces/gone/index.mjs, which is missing',
    );
  }, 120_000);
});

// `ph generate piece` and `ph build`, joined: the templates have to survive
// the piece bundler and the type checker, not just read well.
describe("runBuild on a generated piece", () => {
  const generated = join(fixtures, "generated-piece-package");
  const dist = join(generated, "dist");
  const framework = join(
    import.meta.dirname,
    "..",
    "..",
    "..",
    "packages",
    "pieces-framework",
  );

  beforeAll(async () => {
    if (!existsSync(join(framework, "dist"))) {
      throw new Error(
        "Build @powerhousedao/pieces-framework first: a generated piece bundles it.",
      );
    }
    rmSync(generated, { recursive: true, force: true });
    // A package that ships a document model, like the one a piece is usually
    // added to; its pieces are the generator's to write.
    cpSync(join(fixtures, "mixed-package"), generated, { recursive: true });
    rmSync(join(generated, "pieces"), { recursive: true, force: true });
    clean(generated);
    // The framework resolves from the project the way pnpm would link it.
    mkdirSync(join(generated, "node_modules", "@powerhousedao"), {
      recursive: true,
    });
    symlinkSync(
      framework,
      join(generated, "node_modules", "@powerhousedao", "pieces-framework"),
      "dir",
    );

    // One piece per auth kind, each with the parts `ph generate` adds to it.
    const project = buildTsMorphProject(generated);
    await generatePiece(
      { pieceName: "acme-crm", description: "Connect to Acme CRM." },
      project,
    );
    await generatePieceAction(
      { pieceDir: "acme-crm", actionName: "get-record" },
      project,
    );
    await generatePieceTrigger(
      { pieceDir: "acme-crm", triggerName: "new-record" },
      project,
    );
    await generatePieceTrigger(
      {
        pieceDir: "acme-crm",
        triggerName: "record-updated",
        strategy: "webhook",
      },
      project,
    );
    await generatePiece({ pieceName: "status-page", auth: "secret" }, project);
    await generatePieceAction(
      { pieceDir: "status-page", actionName: "create-incident" },
      project,
    );
    await generatePieceTrigger(
      {
        pieceDir: "status-page",
        triggerName: "incident-opened",
        strategy: "webhook",
      },
      project,
    );
    await generatePiece({ pieceName: "open-data", auth: "none" }, project);
    await generatePieceAction(
      { pieceDir: "open-data", actionName: "list-datasets" },
      project,
    );
    await generatePieceAction(
      {
        pieceDir: "open-data",
        actionName: "archive-dataset",
        requireReactor: "write",
      },
      project,
    );
    await generatePieceTrigger(
      { pieceDir: "open-data", triggerName: "new-dataset" },
      project,
    );
    await generatePieceTrigger(
      {
        pieceDir: "open-data",
        triggerName: "dataset-published",
        strategy: "webhook",
      },
      project,
    );
    await project.save();
    process.chdir(originalCwd);
  }, 120_000);

  afterAll(() => {
    rmSync(generated, { recursive: true, force: true });
  });

  const pieces = [
    {
      slug: "acme-crm",
      displayName: "Acme Crm",
      description: "Connect to Acme CRM.",
      actions: ["get-record"],
      triggers: ["new-record", "record-updated"],
    },
    {
      slug: "status-page",
      displayName: "Status Page",
      description: "Connect to Status Page.",
      actions: ["create-incident"],
      triggers: ["incident-opened"],
    },
    {
      slug: "open-data",
      displayName: "Open Data",
      description: "Connect to Open Data.",
      actions: ["archive-dataset", "list-datasets"],
      triggers: ["dataset-published", "new-dataset"],
    },
  ];

  it("bundles each self-contained, describes it and lists it in the dist manifest", async () => {
    process.chdir(generated);

    await runBuild(args);

    type Descriptor = {
      name: string;
      version: string;
      displayName: string;
      description: string;
      actions: Record<string, { displayName: string; requireReactor?: string }>;
      triggers: Record<string, { displayName: string }>;
    };
    for (const piece of pieces) {
      const id = `@fixture/piece-${piece.slug}`;
      const pieceDir = join(dist, "node", "pieces", piece.slug);
      expect(readdirSync(pieceDir).sort()).toEqual([
        "descriptor.json",
        "index.mjs",
        "package.json",
      ]);
      // The framework and everything under it was inlined, as a piece running
      // in a worker with no node_modules beside it needs.
      expect(
        bareImports(readFileSync(join(pieceDir, "index.mjs"), "utf8")),
      ).toEqual([]);

      const descriptor = readJson<Descriptor>(
        join(pieceDir, "descriptor.json"),
      );
      expect(descriptor.name).toBe(id);
      expect(descriptor.version).toBe("2.0.0");
      expect(descriptor.displayName).toBe(piece.displayName);
      expect(Object.keys(descriptor.actions).sort()).toEqual(piece.actions);
      expect(Object.keys(descriptor.triggers).sort()).toEqual(piece.triggers);
      // The declaration survives the bundler and the describe step.
      for (const [name, action] of Object.entries(descriptor.actions)) {
        expect(action.requireReactor).toBe(
          name === "archive-dataset" ? "write" : undefined,
        );
      }

      expect(
        readJson<Record<string, unknown>>(join(pieceDir, "package.json")),
      ).toEqual({
        name: id,
        version: "2.0.0",
        description: piece.description,
        type: "module",
        main: "index.mjs",
        license: "MIT",
        dependencies: {},
      });
      expect(
        existsSync(join(dist, "types", "pieces", piece.slug, "index.d.ts")),
      ).toBe(true);
    }

    // The source manifest carries the id and the display name codegen wrote;
    // the rest of each entry is what the build learned by loading the piece.
    const manifest = readJson<Manifest>(join(dist, "powerhouse.manifest.json"));
    expect(manifest.pieces).toEqual(
      pieces.map((piece) => ({
        id: `@fixture/piece-${piece.slug}`,
        name: piece.displayName,
        version: "2.0.0",
        description: piece.description,
        bundle: `dist/node/pieces/${piece.slug}`,
        descriptor: `dist/node/pieces/${piece.slug}/descriptor.json`,
      })),
    );

    // No warning means tsc had nothing to say about the generated sources,
    // and every listed piece was built.
    expect(warnings).toEqual([]);
  }, 180_000);
});

// Subgraphs and switchboard processors only run on a host: the browser build
// leaves them out, and the processor factory's switchboard branch is empty.
describe("runBuild on a package with subgraphs and switchboard processors", () => {
  const fixture = join(fixtures, "node-only-package");
  const dist = join(fixture, "dist");

  function write(file: string, content: string) {
    mkdirSync(join(fixture, file, ".."), { recursive: true });
    writeFileSync(join(fixture, file), content);
  }

  // Every built .js/.mjs under dir, joined.
  function code(dir: string): string {
    return readdirSync(dir, { recursive: true })
      .map(String)
      .filter((file) => /\.m?js$/.test(file))
      .map((file) => readFileSync(join(dir, file), "utf8"))
      .join("\n");
  }

  beforeAll(() => {
    rmSync(fixture, { recursive: true, force: true });
    cpSync(join(fixtures, "classic-package"), fixture, { recursive: true });
    clean(fixture);
    const tsconfig = readJson<{ include: string[] }>(
      join(fixture, "tsconfig.json"),
    );
    tsconfig.include.push("subgraphs/**/*", "processors/**/*");
    write("tsconfig.json", JSON.stringify(tsconfig));
    write("subgraphs/index.ts", 'export * as Demo from "./demo/index.js";\n');
    write(
      "subgraphs/demo/index.ts",
      'export const resolve = () => "SUBGRAPH_MARKER";\n',
    );
    write(
      "processors/index.ts",
      'export { processorFactory } from "./factory.js";\n',
    );
    // The generated factory's shape.
    write(
      "processors/factory.ts",
      [
        "export const processorFactory = async (processorApp: string) => {",
        "  const { processorFactoryBuilders } =",
        '    processorApp === "connect"',
        '      ? await import("./connect.js")',
        '      : await import("./switchboard.js");',
        "  return processorFactoryBuilders;",
        "};",
        "",
      ].join("\n"),
    );
    write(
      "processors/connect.ts",
      'export const processorFactoryBuilders: string[] = ["CONNECT_PROCESSOR_MARKER"];\n',
    );
    write(
      "processors/switchboard.ts",
      'import { marker } from "./read-model/index.js";\n\nexport const processorFactoryBuilders: string[] = [marker];\n',
    );
    write(
      "processors/read-model/index.ts",
      'export const marker = "SWITCHBOARD_PROCESSOR_MARKER";\n',
    );
    write(
      "index.ts",
      [
        'export { documentModels } from "./document-models/index.js";',
        'export { editors } from "./editors/index.js";',
        'export { processorFactory } from "./processors/index.js";',
        "",
      ].join("\n"),
    );
  });

  afterAll(() => {
    rmSync(fixture, { recursive: true, force: true });
  });

  it("builds them for node only, and Connect's processors for both", async () => {
    process.chdir(fixture);

    await runBuild(args);

    const browser = code(join(dist, "browser"));
    expect(existsSync(join(dist, "browser", "subgraphs"))).toBe(false);
    expect(browser).not.toContain("SUBGRAPH_MARKER");
    expect(browser).not.toContain("SWITCHBOARD_PROCESSOR_MARKER");
    expect(browser).toContain("CONNECT_PROCESSOR_MARKER");

    const node = code(join(dist, "node"));
    expect(existsSync(join(dist, "node", "subgraphs", "index.mjs"))).toBe(true);
    expect(
      existsSync(join(dist, "node", "processors", "read-model", "index.mjs")),
    ).toBe(true);
    for (const marker of [
      "SUBGRAPH_MARKER",
      "SWITCHBOARD_PROCESSOR_MARKER",
      "CONNECT_PROCESSOR_MARKER",
    ]) {
      expect(node).toContain(marker);
    }

    // The browser factory still answers a switchboard host, with nothing.
    const { processorFactory } = (await import(
      pathToFileURL(join(dist, "browser", "processors", "index.js")).href
    )) as { processorFactory: (app: string) => Promise<string[]> };
    expect(await processorFactory("switchboard")).toEqual([]);
    expect(await processorFactory("connect")).toEqual([
      "CONNECT_PROCESSOR_MARKER",
    ]);
  }, 120_000);
});

// A piece importing a package that loads a binary: that package stays a bare
// import the host installs, and a pure-JS one beside it is still inlined.
describe("runBuild on a piece with a native dependency", () => {
  const fixture = join(fixtures, "native-piece-package");
  const dist = join(fixture, "dist");

  function install(name: string, version: string, js: string, dts: string) {
    const dir = join(fixture, "node_modules", name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({ name, version, main: "index.js", types: "index.d.ts" }),
    );
    writeFileSync(join(dir, "index.js"), js);
    writeFileSync(join(dir, "index.d.ts"), dts);
  }

  beforeAll(() => {
    rmSync(fixture, { recursive: true, force: true });
    cpSync(join(fixtures, "piece-only-package"), fixture, { recursive: true });
    for (const dir of ["goodbye", "orphan"]) {
      rmSync(join(fixture, "pieces", dir), { recursive: true, force: true });
    }
    clean(fixture);
    writeFileSync(
      join(fixture, "powerhouse.manifest.json"),
      JSON.stringify({
        name: "@fixture/piece-only-package",
        documentModels: [],
        editors: [],
        processors: [],
        subgraphs: [],
      }),
    );
    writeFileSync(
      join(fixture, "pieces", "index.ts"),
      [
        "export const pieces = [",
        '  { name: "@fixture/piece-hello", entry: "dist/node/pieces/hello/index.mjs" },',
        '  { name: "@fixture/piece-native", entry: "dist/node/pieces/native/index.mjs" },',
        "];",
        "export default pieces;",
        "",
      ].join("\n"),
    );

    // Loads its binary only when called, so describing the piece still works.
    install(
      "native-a",
      "3.1.4",
      'exports.load = () => require("./build/Release/native_a.node");\n',
      "export declare function load(): unknown;\n",
    );
    const release = join(
      fixture,
      "node_modules",
      "native-a",
      "build",
      "Release",
    );
    mkdirSync(release, { recursive: true });
    writeFileSync(join(release, "native_a.node"), "not really a binary");
    install(
      "pure-b",
      "0.0.1",
      'exports.marker = "pure-b-was-inlined";\n',
      "export declare const marker: string;\n",
    );

    mkdirSync(join(fixture, "pieces", "native"), { recursive: true });
    writeFileSync(
      join(fixture, "pieces", "native", "index.ts"),
      [
        'import { load } from "native-a";',
        'import { marker } from "pure-b";',
        "",
        "export const native = {",
        '  displayName: "Native",',
        '  logoUrl: "data:,",',
        '  description: "Loads a binary.",',
        '  authors: ["fixture"],',
        '  categories: ["CORE"],',
        "  auth: undefined,",
        '  minimumSupportedRelease: "0.30.0",',
        "  actions() {",
        "    return {",
        "      probe: {",
        '        name: "probe",',
        '        displayName: "Probe",',
        '        description: "",',
        "        requireAuth: false,",
        "        props: {},",
        "        run: () => Promise.resolve([marker, load()]),",
        "      },",
        "    };",
        "  },",
        "  triggers() {",
        "    return {};",
        "  },",
        "};",
        "",
      ].join("\n"),
    );
  });

  afterAll(() => {
    rmSync(fixture, { recursive: true, force: true });
  });

  it("keeps the native package external and declares it at its installed version", async () => {
    process.chdir(fixture);

    await runBuild(args);

    const pieceDir = join(dist, "node", "pieces", "native");
    const bundle = readFileSync(join(pieceDir, "index.mjs"), "utf8");
    // Minified: `from"native-a"`, with no space for bareImports to match.
    const imported = [...bundle.matchAll(/from\s*["']([^"']+)["']/g)].map(
      (match) => match[1],
    );
    expect(imported.filter((spec) => !isBuiltin(spec))).toEqual(["native-a"]);
    expect(bundle).toContain("pure-b-was-inlined");
    expect(bundle).not.toContain("native_a.node");

    expect(
      readJson<Record<string, unknown>>(join(pieceDir, "package.json")),
    ).toEqual({
      name: "@fixture/piece-native",
      version: "1.2.3",
      description: "Loads a binary.",
      type: "module",
      main: "index.mjs",
      license: "MIT",
      dependencies: { "native-a": "3.1.4" },
    });
    // Another piece in the same package declares nothing of it.
    expect(
      readJson<{ dependencies: unknown }>(
        join(dist, "node", "pieces", "hello", "package.json"),
      ).dependencies,
    ).toEqual({});
    expect(warnings).toEqual([]);
  }, 120_000);
});

// Subgraphs and processors importing a package that loads a binary: it stays a
// bare import, the dist manifest lists it, and the browser build refuses it.
describe("runBuild on a package whose node code has a native dependency", () => {
  const fixture = join(fixtures, "native-node-package");
  const dist = join(fixture, "dist");
  const NATIVE_A = { "native-a": "file:./vendor/native-a" };
  const WASM_A = { "wasm-a": "file:./vendor/wasm-a" };

  function write(file: string, content: string) {
    mkdirSync(join(fixture, file, ".."), { recursive: true });
    writeFileSync(join(fixture, file), content);
  }

  // A fresh copy of the classic package, with native-a installed from a
  // file: dependency, as the package manager would install a real one.
  function setUp(packageJson: Record<string, unknown>) {
    rmSync(fixture, { recursive: true, force: true });
    cpSync(join(fixtures, "classic-package"), fixture, { recursive: true });
    clean(fixture);
    write(
      "package.json",
      JSON.stringify({
        name: "@fixture/classic-package",
        version: "4.1.0",
        private: true,
        license: "MIT",
        type: "module",
        ...packageJson,
      }),
    );
    const tsconfig = readJson<{ include: string[] }>(
      join(fixture, "tsconfig.json"),
    );
    tsconfig.include.push("subgraphs/**/*", "processors/**/*");
    write("tsconfig.json", JSON.stringify(tsconfig));

    write(
      "vendor/native-a/package.json",
      JSON.stringify({
        name: "native-a",
        version: "3.1.4",
        main: "index.js",
        types: "index.d.ts",
      }),
    );
    write(
      "vendor/native-a/index.js",
      'exports.load = () => require("./build/Release/native_a.node");\n',
    );
    write(
      "vendor/native-a/index.d.ts",
      "export declare function load(): unknown;\n",
    );
    write("vendor/native-a/build/Release/native_a.node", "not really a binary");
    // Its caller passes the module in, so only the file's presence tells.
    write(
      "vendor/wasm-a/package.json",
      JSON.stringify({
        name: "wasm-a",
        version: "0.2.0",
        main: "index.js",
        types: "index.d.ts",
      }),
    );
    write(
      "vendor/wasm-a/index.js",
      "exports.init = (bytes) => WebAssembly.compile(bytes);\n",
    );
    write(
      "vendor/wasm-a/index.d.ts",
      "export declare function init(bytes: Uint8Array): unknown;\n",
    );
    write("vendor/wasm-a/wasm_a_bg.wasm", "not really a module");
    // Copied, as a package manager installs a file: dependency.
    const deps = {
      ...(packageJson.dependencies as Record<string, string> | undefined),
      ...(packageJson.devDependencies as Record<string, string> | undefined),
    };
    for (const [name, spec] of Object.entries(deps)) {
      if (!spec.startsWith("file:")) continue;
      cpSync(
        join(fixture, spec.slice(5)),
        join(fixture, "node_modules", name),
        {
          recursive: true,
        },
      );
    }

    write(
      "subgraphs/index.ts",
      'export * as Native from "./native/index.js";\n',
    );
    write(
      "subgraphs/native/index.ts",
      'import { load } from "native-a";\n\nexport const resolve = () => load();\n',
    );
    // The generated shape: Connect loads the root index, which reaches the
    // switchboard processors only through a dynamic import.
    write(
      "processors/index.ts",
      'export { processorFactory } from "./factory.js";\n',
    );
    write(
      "processors/factory.ts",
      [
        "export const processorFactory = async (app: string) =>",
        '  app === "connect" ? [] : (await import("./switchboard.js")).processors;',
        "",
      ].join("\n"),
    );
    write(
      "processors/switchboard.ts",
      'import { load } from "native-a";\n\nexport const processors = [load];\n',
    );
    write(
      "index.ts",
      [
        'export { documentModels } from "./document-models/index.js";',
        'export { editors } from "./editors/index.js";',
        'export { processorFactory } from "./processors/index.js";',
        "",
      ].join("\n"),
    );
  }

  // Every built .mjs/.js under dir, by path relative to it.
  function bundles(dir: string): Map<string, string> {
    const out = new Map<string, string>();
    for (const entry of readdirSync(dir, { recursive: true })) {
      const file = String(entry);
      if (/\.m?js$/.test(file)) {
        out.set(file, readFileSync(join(dir, file), "utf8"));
      }
    }
    return out;
  }

  afterAll(() => {
    rmSync(fixture, { recursive: true, force: true });
  });

  it("keeps it external and lists it in the dist manifest at its installed version", async () => {
    setUp({ dependencies: NATIVE_A });
    process.chdir(fixture);

    await runBuild(args);

    // The subgraph and the switchboard processors import it on node; the
    // browser build has neither.
    for (const [platform, files] of [
      ["node", 2],
      ["browser", 0],
    ] as const) {
      const built = bundles(join(dist, platform));
      const importing = [...built]
        .filter(([, code]) => /from\s*["']native-a["']/.test(code))
        .map(([file]) => file);
      expect(importing.length, platform).toBeGreaterThanOrEqual(files);
      if (files === 0) expect(importing, platform).toEqual([]);
      for (const code of built.values()) {
        expect(code).not.toContain("native_a.node");
      }
    }
    expect(
      readJson<Manifest>(join(dist, "powerhouse.manifest.json"))
        .externalDependencies,
    ).toEqual({ "native-a": "3.1.4" });
    // The source manifest is left as it was.
    expect(
      readJson<Manifest>(join(fixture, "powerhouse.manifest.json")),
    ).not.toHaveProperty("externalDependencies");
    expect(warnings).toEqual([]);
  }, 120_000);

  it("keeps a WebAssembly package external for switchboard processors and bundles it for editors", async () => {
    setUp({ dependencies: { ...NATIVE_A, ...WASM_A } });
    write(
      "processors/switchboard.ts",
      'import { load } from "native-a";\nimport { init } from "wasm-a";\n\nexport const processors = [load, init];\n',
    );
    write(
      "editors/index.ts",
      'import { init } from "wasm-a";\n\nexport const editors: unknown[] = [init];\n',
    );
    process.chdir(fixture);

    await runBuild(args);

    const importsWasmA = (code: string) => /from\s*["']wasm-a["']/.test(code);
    const inlinesWasmA = (code: string) => code.includes("WebAssembly.compile");
    const node = bundles(join(dist, "node"));
    const nodeProcessors = [...node]
      .filter(([file]) => !file.startsWith("editors"))
      .map(([, code]) => code);
    expect(nodeProcessors.some(importsWasmA)).toBe(true);
    expect(nodeProcessors.some(inlinesWasmA)).toBe(false);
    // Only the editors reach it in the browser build, and they bundle it.
    const browser = [...bundles(join(dist, "browser")).values()];
    expect(browser.some(importsWasmA)).toBe(false);
    expect(browser.some(inlinesWasmA)).toBe(true);
    expect(
      readJson<Manifest>(join(dist, "powerhouse.manifest.json"))
        .externalDependencies,
    ).toEqual({ "native-a": "3.1.4", "wasm-a": "0.2.0" });
  }, 120_000);

  it("leaves out a WebAssembly package only an editor imports", async () => {
    setUp({ dependencies: { ...NATIVE_A, ...WASM_A } });
    write(
      "editors/index.ts",
      'import { init } from "wasm-a";\n\nexport const editors: unknown[] = [init];\n',
    );
    process.chdir(fixture);

    await runBuild(args);

    expect(
      readJson<Manifest>(join(dist, "powerhouse.manifest.json"))
        .externalDependencies,
    ).toEqual({ "native-a": "3.1.4" });
  }, 120_000);

  it("fails when a document model imports a WebAssembly package", async () => {
    setUp({ dependencies: { ...NATIVE_A, ...WASM_A } });
    write(
      "document-models/index.ts",
      'import { init } from "wasm-a";\n\nexport const documentModels = [{ id: "fixture/widget", name: "Widget", init }];\n',
    );
    process.chdir(fixture);

    await expect(runBuild(args)).rejects.toThrow(
      /document-models\/index\.ts imports wasm-a, which needs the WebAssembly module \S*wasm_a_bg\.wasm\. Document models run in Connect and on every host/,
    );
  }, 120_000);

  it("fails when the native package is only a devDependency", async () => {
    setUp({ devDependencies: NATIVE_A });
    process.chdir(fixture);

    await expect(runBuild(args)).rejects.toThrow(
      /must be listed in package\.json "dependencies"[\s\S]*native-a \(imported by (subgraphs\/native\/index|processors\/switchboard)\.ts\)/,
    );
  }, 120_000);

  it("fails the browser build when an editor imports it", async () => {
    setUp({ dependencies: NATIVE_A });
    write(
      "editors/index.ts",
      'import { load } from "native-a";\n\nexport const editors: unknown[] = [load];\n',
    );
    process.chdir(fixture);

    await expect(runBuild(args)).rejects.toThrow(
      /editors\/index\.ts imports native-a, which needs the native addon node_modules\/\S*native_a\.node\. Native code cannot run in the browser/,
    );
    expect(existsSync(join(dist, "node"))).toBe(false);
  }, 120_000);
});
