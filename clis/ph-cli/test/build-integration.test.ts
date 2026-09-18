// `runBuild` end to end on the fixtures under test/fixtures, built in place
// the way `ph build` builds a project, every step running for every one.

import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { isBuiltin } from "node:module";
import { join } from "node:path";
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
function bareImports(source: string): string[] {
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
let stubDir: string;

beforeAll(() => {
  stubDir = mkdtempSync(join(tmpdir(), "ph-tailwind-stub-"));
  const stub = join(stubDir, "tailwindcss");
  writeFileSync(
    stub,
    `#!/bin/sh\nout=""\nwhile [ $# -gt 0 ]; do\n  case "$1" in -o) out="$2"; shift 2;; *) shift;; esac\ndone\n[ -n "$out" ] && mkdir -p "$(dirname "$out")" && printf '/* stub */\\n' > "$out"\nexit 0\n`,
  );
  chmodSync(stub, 0o755);
  process.env.PATH = `${stubDir}:${process.env.PATH ?? ""}`;
});

afterAll(() => {
  rmSync(stubDir, { recursive: true, force: true });
});

beforeEach(() => {
  warnings = [];
  vi.spyOn(console, "warn").mockImplementation((...parts: unknown[]) => {
    warnings.push(parts.map(String).join(" "));
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
        "index.mjs.map",
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

    // The descriptor: the list's name and version, the piece's metadata,
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
    expect(goodbyeDescriptor.version).toBe("0.1.0");
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
        version: "0.1.0",
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
      "index.mjs.map",
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
