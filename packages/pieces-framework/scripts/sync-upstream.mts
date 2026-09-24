// Regenerates upstream/ and test/upstream/ from an Activepieces tag. The only
// way those trees change; see UPSTREAM.md.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import { builtinModules } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  Project,
  type ImportSpecifierStructure,
  type OptionalKind,
  type SourceFile,
} from "ts-morph";

interface UpstreamPackage {
  dir: string;
  upstreamDir: string;
  specifier: string;
  // When set, only these paths (relative to the package root) are vendored.
  files?: string[];
}

// Literal edits applied after the codemod and formatting; each must match
// exactly `count` times (default 1) or the sync fails.
interface Patch {
  file: string;
  find: string;
  replace: string;
  why: string;
  count?: number;
}

interface ManifestFile {
  path: string;
  upstream: string;
  sha256: string;
}

interface Manifest {
  repository: string;
  tag: string;
  commit: string;
  date: string;
  packages: Record<
    string,
    { upstreamDir: string; name: string; version: string }
  >;
  license: { upstream: string; sha256: string };
  files: ManifestFile[];
}

const PACKAGES: UpstreamPackage[] = [
  {
    dir: "framework",
    upstreamDir: "packages/pieces/framework",
    specifier: "@activepieces/pieces-framework",
  },
  {
    dir: "common",
    upstreamDir: "packages/pieces/common",
    specifier: "@activepieces/pieces-common",
  },
  {
    dir: "core-piece-types",
    upstreamDir: "packages/core/piece-types",
    specifier: "@activepieces/core-piece-types",
  },
  {
    dir: "core-utils",
    upstreamDir: "packages/core/utils",
    specifier: "@activepieces/core-utils",
  },
  // Only the prop-coercion corner of the engine: everything else there reaches
  // for the flow executor, the sandbox or the platform API. See UPSTREAM.md.
  {
    dir: "engine",
    upstreamDir: "packages/server/engine",
    specifier: "@activepieces/engine",
    files: [
      "src/lib/helper/dynamic-prop-keys.ts",
      "src/lib/variables/processors/array-zipper.ts",
      "src/lib/variables/processors/checkbox.ts",
      "src/lib/variables/processors/date-time.ts",
      "src/lib/variables/processors/file.ts",
      "src/lib/variables/processors/index.ts",
      "src/lib/variables/processors/json.ts",
      "src/lib/variables/processors/multi-select.ts",
      "src/lib/variables/processors/number.ts",
      "src/lib/variables/processors/object.ts",
      "src/lib/variables/processors/text.ts",
      "src/lib/variables/processors/types.ts",
      "src/lib/variables/props-processor.ts",
      "test/variables/file-processor.test.ts",
      "test/variables/props-validator.test.ts",
    ],
  },
];

// @activepieces/shared is not vendored (8k lines of platform entities). Every
// symbol the vendored engine files take from it is re-homed to its real owner.
const SHARED_SPECIFIER = "@activepieces/shared";
const SHARED_SHIM = "src/host/shared-shim.ts";
const SHARED_SYMBOL_HOMES: Record<string, string | undefined> = {
  AUTHENTICATION_PROPERTY_NAME: "core-piece-types",
  AppConnectionValue: "core-piece-types",
  PropertySettings: SHARED_SHIM,
};

const PATCHES: Patch[] = [
  {
    file: "upstream/common/lib/http/core/fetch-http-client.ts",
    why: "@types/node 25: Buffer<ArrayBufferLike> is no longer a BodyInit",
    find: "        body: buffered,\n",
    replace: "        body: buffered as unknown as BodyInit,\n",
  },
  {
    file: "upstream/common/lib/http/core/fetch-http-client.ts",
    why: "prettier splits the ternary, moving the error off the @ts-expect-error line",
    find:
      "      // @ts-expect-error -- undici streams a Node web ReadableStream body; the DOM fetch types omit the fromWeb overload\n" +
      "      return isNil(response.body)\n" +
      "        ? Readable.from([])\n" +
      "        : Readable.fromWeb(response.body);\n",
    replace:
      "      // undici streams a Node web ReadableStream body; the DOM fetch types omit the fromWeb overload\n" +
      "      return isNil(response.body)\n" +
      "        ? Readable.from([])\n" +
      "        : Readable.fromWeb(\n" +
      "            response.body as unknown as Parameters<typeof Readable.fromWeb>[0],\n" +
      "          );\n",
  },
  {
    file: "upstream/common/lib/http/core/fetch-http-client.ts",
    why: "NODE_TLS_REJECT_UNAUTHORIZED is process-wide; this disabled cert verification for the whole host on every request",
    find:
      "  ): Promise<HttpResponse<ResponseBody>> {\n" +
      '    process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = "0";\n' +
      "\n" +
      "    const { urlWithoutQueryParams, queryParams: urlQueryParams } =\n",
    replace:
      "  ): Promise<HttpResponse<ResponseBody>> {\n" +
      "    const { urlWithoutQueryParams, queryParams: urlQueryParams } =\n",
  },
  {
    file: "upstream/common/lib/http/core/fetch-http-client.ts",
    why: "HttpError's message embeds the request body; logging it can write secrets to host logs",
    find:
      "      });\n" +
      "      console.error(\n" +
      '        "[HttpClient#(sanitized error message)] Request failed:",\n' +
      "        httpError,\n" +
      "      );\n" +
      "      throw httpError;\n",
    replace: "      });\n      throw httpError;\n",
  },
  {
    file: "upstream/common/lib/stream/index.ts",
    why: "chunkSize <= 0 makes the drain loop's condition permanently true, hanging the generator forever",
    find:
      "  let pending: Buffer[] = [];\n" +
      "  let pendingLength = 0;\n" +
      "  for await (const data of readable) {\n",
    replace:
      "  let pending: Buffer[] = [];\n" +
      "  let pendingLength = 0;\n" +
      "  if (!Number.isInteger(chunkSize) || chunkSize <= 0) {\n" +
      '    throw new Error("chunkSize must be a positive integer");\n' +
      "  }\n" +
      "  for await (const data of readable) {\n",
  },
  {
    file: "upstream/common/lib/helpers/index.ts",
    why: '!isNil(authLocation) is always true (it defaults to "headers"), so query-param auth was duplicated into headers',
    find:
      '          ...(authLocation === "headers" || !isNil(authLocation)\n' +
      "            ? authValue\n" +
      "            : {}),\n",
    replace: '          ...(authLocation === "headers" ? authValue : {}),\n',
  },
  {
    file: "upstream/framework/lib/property/input/array-property.ts",
    why: "ArraySubProps's runtime union omits Json/Color even though the exported type and Property.Array both allow them",
    find:
      'import type { JsonProperty } from "./json-property.js";\n' +
      'import type { ColorProperty } from "./color-property.js";\n',
    replace:
      'import { JsonProperty } from "./json-property.js";\n' +
      'import { ColorProperty } from "./color-property.js";\n',
  },
  {
    file: "upstream/framework/lib/property/input/array-property.ts",
    why: "same: add the two schemas to the union, ordered as the type union below already has them",
    find:
      "    FileProperty,\n" + "    DateTimeProperty,\n" + "  ]),\n" + ");\n",
    replace:
      "    FileProperty,\n" +
      "    JsonProperty,\n" +
      "    ColorProperty,\n" +
      "    DateTimeProperty,\n" +
      "  ]),\n" +
      ");\n",
  },
  {
    file: "upstream/framework/lib/property/input/array-property.ts",
    why: "the exported ArrayProperty<R> type and buildSchema both treat properties as optional; the runtime schema required it",
    find: "  properties: ArraySubProps,\n",
    replace: "  properties: z.optional(ArraySubProps),\n",
  },
  {
    file: "upstream/framework/lib/property/input/index.ts",
    why: "CustomProperty is part of the exported InputProperty type and built by Property.Custom, but missing from the runtime union",
    find:
      "import type {\n" +
      "  CustomProperty,\n" +
      "  CustomPropertyCodeFunctionParams,\n" +
      '} from "./custom-property.js";\n',
    replace:
      'import { CustomProperty } from "./custom-property.js";\n' +
      'import type { CustomPropertyCodeFunctionParams } from "./custom-property.js";\n',
  },
  {
    file: "upstream/framework/lib/property/input/index.ts",
    why: "same: add it to the union, matching its place in the type union just below",
    find: "  FileProperty,\n  ColorProperty,\n]);\n",
    replace: "  FileProperty,\n  CustomProperty,\n  ColorProperty,\n]);\n",
  },
  {
    file: "upstream/framework/lib/property/authentication/custom-auth-prop.ts",
    why: "the runtime CustomAuthProps union is narrower than the exported type; make StaticMultiSelectDropdownProperty a value import",
    find: 'import type { StaticMultiSelectDropdownProperty } from "../input/dropdown/static-dropdown.js";\n',
    replace:
      'import { StaticMultiSelectDropdownProperty } from "../input/dropdown/static-dropdown.js";\n',
  },
  {
    file: "upstream/framework/lib/property/authentication/custom-auth-prop.ts",
    why: "same: SecretTextProperty is a valid CustomAuthProps member too",
    find: 'import type { SecretTextProperty } from "./secret-text-property.js";\n',
    replace:
      'import { SecretTextProperty } from "./secret-text-property.js";\n',
  },
  {
    file: "upstream/framework/lib/property/authentication/custom-auth-prop.ts",
    why: "same: MarkDownProperty is a valid CustomAuthProps member too",
    find: 'import type { MarkDownProperty } from "../input/markdown-property.js";\n',
    replace:
      'import { MarkDownProperty } from "../input/markdown-property.js";\n',
  },
  {
    file: "upstream/framework/lib/property/authentication/custom-auth-prop.ts",
    why: "add the three schemas the exported CustomAuthProps type already permits, ordered as that type is",
    find:
      "  z.union([\n" +
      "    ShortTextProperty,\n" +
      "    LongTextProperty,\n" +
      "    NumberProperty,\n" +
      "    CheckboxProperty,\n" +
      "    StaticDropdownProperty,\n" +
      "  ]),\n",
    replace:
      "  z.union([\n" +
      "    ShortTextProperty,\n" +
      "    LongTextProperty,\n" +
      "    SecretTextProperty,\n" +
      "    NumberProperty,\n" +
      "    StaticDropdownProperty,\n" +
      "    CheckboxProperty,\n" +
      "    MarkDownProperty,\n" +
      "    StaticMultiSelectDropdownProperty,\n" +
      "  ]),\n",
  },
  {
    file: "upstream/framework/lib/property/input/markdown-property.ts",
    why: "Property.MarkDown always writes a variant, and the type declares it, but the runtime schema stripped it as an unknown key",
    find:
      'import type { MarkdownVariant } from "../../../../core-piece-types/index.js";\n' +
      "\n" +
      "export const MarkDownProperty = z.object({\n" +
      "  ...BasePropertySchema.shape,\n" +
      "  ...TPropertyValue(z.void(), PropertyType.MARKDOWN).shape,\n" +
      "});\n",
    replace:
      'import { MarkdownVariant } from "../../../../core-piece-types/index.js";\n' +
      "\n" +
      "export const MarkDownProperty = z.object({\n" +
      "  ...BasePropertySchema.shape,\n" +
      "  ...TPropertyValue(z.void(), PropertyType.MARKDOWN).shape,\n" +
      "  variant: z.optional(z.enum(MarkdownVariant)),\n" +
      "});\n",
  },
  {
    file: "upstream/framework/index.ts",
    why: "rolldown-plugin-dts drops `type` on a re-export of a merged const+type; export the value too",
    find: 'export type { SeekPage } from "../core-utils/index.js";\n',
    replace: 'export { SeekPage } from "../core-utils/index.js";\n',
  },
  {
    file: "upstream/framework/index.ts",
    why: "same for McpAuthConfig: move it from the type-only block to the value block",
    find:
      "  DEFAULT_CHAT_TIER_ID,\n" +
      '} from "../core-piece-types/index.js";\n' +
      "export type {\n" +
      "  McpAuthConfig,\n",
    replace:
      "  DEFAULT_CHAT_TIER_ID,\n" +
      "  McpAuthConfig,\n" +
      '} from "../core-piece-types/index.js";\n' +
      "export type {\n",
  },
  {
    file: "upstream/framework/lib/property/index.ts",
    why: "same for InputProperty",
    find: 'export type { InputProperty } from "./input/index.js";\n',
    replace: 'export { InputProperty } from "./input/index.js";\n',
  },
  {
    file: "upstream/engine/lib/variables/props-processor.ts",
    why: "export the validator half, for a host that runs its own processors first",
    find: "const validateProperty = (\n",
    replace: "export const validateProperty = (\n",
  },
  {
    file: "test/upstream/engine/test/variables/file-processor.test.ts",
    why: "upstream never typechecks this test; propsProcessor returns unknown values",
    find: "    const file: ApStreamingFile = processedInput.file;\n",
    replace: "    const file = processedInput.file as ApStreamingFile;\n",
    count: 5,
  },
  {
    file: "test/upstream/engine/test/variables/props-validator.test.ts",
    why: "upstream never typechecks this test; Property.Dropdown requires auth",
    find:
      "        dropdown: Property.Dropdown({\n" +
      '          displayName: "Dropdown",\n' +
      "          required: false,\n",
    replace:
      "        dropdown: Property.Dropdown({\n" +
      '          displayName: "Dropdown",\n' +
      "          required: false,\n" +
      "          auth: undefined,\n",
  },
  {
    file: "test/upstream/engine/test/variables/props-validator.test.ts",
    why: "same for Property.MultiSelectDropdown",
    find:
      "      multiSelect: Property.MultiSelectDropdown({\n" +
      '        displayName: "Multi Select",\n' +
      "        required: false,\n",
    replace:
      "      multiSelect: Property.MultiSelectDropdown({\n" +
      '        displayName: "Multi Select",\n' +
      "        required: false,\n" +
      "        auth: undefined,\n",
  },
  {
    file: "upstream/framework/lib/trigger/trigger.ts",
    why: "createTrigger's switch has no default, so an unknown type returned undefined and the piece failed far from the cause; name the field, and the common `strategy` slip",
    find: "        params.propertyGroups,\n      );\n  }\n};\n",
    replace:
      "        params.propertyGroups,\n" +
      "      );\n" +
      "    default: {\n" +
      "      const { name, type, strategy } = params as Record<string, unknown>;\n" +
      "      throw new Error(\n" +
      "        type === undefined && strategy !== undefined\n" +
      "          ? `createTrigger: trigger ${JSON.stringify(name)} sets \\`strategy\\`; the field is \\`type\\`, e.g. type: TriggerStrategy.POLLING`\n" +
      "          : `createTrigger: trigger ${JSON.stringify(name)} has \\`type\\` ${JSON.stringify(type)}; set type: TriggerStrategy.POLLING or TriggerStrategy.WEBHOOK`,\n" +
      "      );\n" +
      "    }\n" +
      "  }\n" +
      "};\n",
  },
  {
    file: "test/upstream/framework/test/connection-identifier-flag.test.ts",
    why: "upstream never typechecks this test; createPiece requires authors",
    find: '    logoUrl: "https://example.com/logo.png",\n    auth,\n',
    replace:
      '    logoUrl: "https://example.com/logo.png",\n    authors: [],\n    auth,\n',
  },
  {
    file: "test/upstream/core-utils/test/ai-provider-health.test.ts",
    why: "upstream never typechecks this test; a reporter returns void, push returns number",
    find: "observedProviderFetch((signal) => signals.push(signal))",
    replace:
      "observedProviderFetch((signal) => {\n        signals.push(signal);\n      })",
    count: 3,
  },
];

// Node's ESM resolver does no extension inference for a package subpath, and
// these dependencies ship no "exports" map. Upstream is CommonJS, we are not.
const EXTENSIONLESS_SUBPATHS: Record<string, string> = {
  "dayjs/plugin/timezone": "dayjs/plugin/timezone.js",
  "dayjs/plugin/utc": "dayjs/plugin/utc.js",
};

// Upstream's bundler alias for mime-db; aliasing it is the piece build's job.
const SKIP_FILES = new Set(["mime-db-min.cjs"]);
const REPO_URL = "https://github.com/activepieces/activepieces.git";
const REPO_SLUG = "activepieces/activepieces";

const PKG_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const UPSTREAM_OUT = path.join(PKG_ROOT, "upstream");
const TEST_OUT = path.join(PKG_ROOT, "test", "upstream");
const LICENSE_FILE = path.join(PKG_ROOT, "LICENSE");
const ESLINT_CONFIG = path.join(
  PKG_ROOT,
  "scripts",
  "sync-upstream.eslint.config.mjs",
);

function parseArgs(argv: string[]): { tag: string; from?: string } {
  let tag: string | undefined;
  let from: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--") continue;
    if (arg === "--tag") tag = argv[++i];
    else if (arg === "--from") from = argv[++i];
    else if (arg.startsWith("--tag=")) tag = arg.slice("--tag=".length);
    else if (arg.startsWith("--from=")) from = arg.slice("--from=".length);
    else throw new Error(`unknown argument ${arg}`);
  }
  if (!tag) {
    throw new Error(
      "usage: pnpm sync-upstream -- --tag <activepieces tag> [--from <checkout>]",
    );
  }
  return { tag, from };
}

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function sha256(buffer: Buffer | string): string {
  return createHash("sha256").update(buffer).digest("hex");
}

function walk(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out.sort();
}

function toPosix(p: string): string {
  return p.split(path.sep).join("/");
}

function isTestFile(file: string): boolean {
  return /\.(spec|test)\.ts$/.test(file);
}

interface Tree {
  root: string;
  commit: string;
  date: string;
  cleanup: () => void;
}

function obtainTree(tag: string, from: string | undefined): Tree {
  if (from) {
    const root = path.resolve(from);
    const commit = git(root, "rev-parse", "HEAD");
    const tags = git(root, "tag", "--points-at", "HEAD").split("\n");
    if (!tags.includes(tag)) {
      throw new Error(`${root} is at ${commit}, which is not tagged ${tag}`);
    }
    const date = git(root, "log", "-1", "--format=%cI", "HEAD");
    return { root, commit, date, cleanup: () => undefined };
  }
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "activepieces-"));
  execFileSync(
    "git",
    [
      "clone",
      "--depth",
      "1",
      "--filter=blob:none",
      "--sparse",
      "--branch",
      tag,
      REPO_URL,
      root,
    ],
    { stdio: "inherit" },
  );
  git(root, "sparse-checkout", "set", ...PACKAGES.map((p) => p.upstreamDir));
  const commit = git(root, "rev-parse", "HEAD");
  const date = git(root, "log", "-1", "--format=%cI", "HEAD");
  return {
    root,
    commit,
    date,
    cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
  };
}

function readVersion(pkgJsonPath: string): string {
  const parsed = JSON.parse(fs.readFileSync(pkgJsonPath, "utf8")) as {
    version?: unknown;
  };
  if (typeof parsed.version !== "string") {
    throw new Error(`no version in ${pkgJsonPath}`);
  }
  return parsed.version;
}

// Original absolute path -> vendored absolute path.
function planCopies(tree: Tree): Map<string, string> {
  const plan = new Map<string, string>();
  for (const pkg of PACKAGES) {
    const pkgRoot = path.join(tree.root, pkg.upstreamDir);
    const wanted = pkg.files ? new Set(pkg.files) : undefined;
    const taken = new Set<string>();
    const keep = (file: string): boolean => {
      const rel = toPosix(path.relative(pkgRoot, file));
      if (!wanted) return true;
      if (!wanted.has(rel)) return false;
      taken.add(rel);
      return true;
    };
    const srcDir = path.join(pkgRoot, "src");
    for (const file of walk(srcDir)) {
      if (SKIP_FILES.has(path.basename(file))) continue;
      if (!keep(file)) continue;
      const rel = path.relative(srcDir, file);
      const dest = isTestFile(file)
        ? path.join(TEST_OUT, pkg.dir, "src", rel)
        : path.join(UPSTREAM_OUT, pkg.dir, rel);
      plan.set(file, dest);
    }
    const testDir = path.join(pkgRoot, "test");
    for (const file of walk(testDir)) {
      if (!keep(file)) continue;
      plan.set(
        file,
        path.join(TEST_OUT, pkg.dir, "test", path.relative(testDir, file)),
      );
    }
    const missing = [...(wanted ?? [])].filter((rel) => !taken.has(rel));
    if (missing.length > 0) {
      throw new Error(
        `${pkg.upstreamDir} no longer has ${missing.join(", ")}; revisit the file list`,
      );
    }
  }
  return plan;
}

function relativeSpecifier(fromFile: string, toFile: string): string {
  let rel = toPosix(path.relative(path.dirname(fromFile), toFile));
  if (!rel.startsWith(".")) rel = `./${rel}`;
  return rel.replace(/\.tsx?$/, ".js");
}

function rewriteSpecifier(
  spec: string,
  origFile: string,
  destFile: string,
  plan: Map<string, string>,
): string {
  const bare = PACKAGES.find(
    (p) => spec === p.specifier || spec.startsWith(`${p.specifier}/`),
  );
  if (bare) {
    if (spec !== bare.specifier) {
      throw new Error(`deep import ${spec} in ${origFile} is not supported`);
    }
    return relativeSpecifier(
      destFile,
      path.join(UPSTREAM_OUT, bare.dir, "index.ts"),
    );
  }
  if (spec.startsWith(".")) {
    const base = path.resolve(path.dirname(origFile), spec);
    const candidates = [
      base,
      `${base}.ts`,
      `${base}.tsx`,
      path.join(base, "index.ts"),
    ];
    const hit = candidates.find((c) => plan.has(c));
    if (!hit) {
      throw new Error(`cannot resolve ${spec} from ${origFile}`);
    }
    return relativeSpecifier(destFile, plan.get(hit)!);
  }
  if (!spec.startsWith("node:") && builtinModules.includes(spec)) {
    return `node:${spec}`;
  }
  return EXTENSIONLESS_SUBPATHS[spec] ?? spec;
}

function header(tag: string, upstreamPath: string, destFile: string): string {
  const license = toPosix(path.relative(path.dirname(destFile), LICENSE_FILE));
  return (
    `// Vendored from ${REPO_SLUG}@${tag} ${upstreamPath}. MIT; see ${license}.\n` +
    `// Generated by scripts/sync-upstream.mts — do not edit by hand.\n`
  );
}

function sharedHomeFile(home: string): string {
  return home.endsWith(".ts")
    ? path.join(PKG_ROOT, home)
    : path.join(UPSTREAM_OUT, home, "index.ts");
}

// Splits an @activepieces/shared import across the packages that really own each
// symbol, plus our shim for the ones only that unvendored package declares.
function rehomeSharedImports(sourceFile: SourceFile, destFile: string): void {
  for (const decl of sourceFile.getImportDeclarations()) {
    if (decl.getModuleSpecifierValue() !== SHARED_SPECIFIER) continue;
    if (decl.getDefaultImport() ?? decl.getNamespaceImport()) {
      throw new Error(
        `${sourceFile.getFilePath()} imports ${SHARED_SPECIFIER} as a namespace or default; only named imports are re-homed`,
      );
    }
    const byHome = new Map<string, OptionalKind<ImportSpecifierStructure>[]>();
    for (const named of decl.getNamedImports()) {
      const name = named.getName();
      const home = SHARED_SYMBOL_HOMES[name];
      if (home === undefined) {
        throw new Error(
          `no home recorded for ${SHARED_SPECIFIER}'s ${name}; extend SHARED_SYMBOL_HOMES`,
        );
      }
      const list = byHome.get(home) ?? [];
      list.push({
        name,
        alias: named.getAliasNode()?.getText(),
        isTypeOnly: named.isTypeOnly(),
      });
      byHome.set(home, list);
    }
    for (const [home, namedImports] of byHome) {
      sourceFile.addImportDeclaration({
        moduleSpecifier: relativeSpecifier(destFile, sharedHomeFile(home)),
        namedImports,
        isTypeOnly: decl.isTypeOnly(),
      });
    }
    decl.remove();
  }
}

function codemod(tree: Tree, tag: string, plan: Map<string, string>): void {
  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    skipFileDependencyResolution: true,
  });
  for (const [orig, dest] of plan) {
    if (!dest.endsWith(".ts")) continue;
    const sourceFile = project.addSourceFileAtPath(dest);
    const declarations = [
      ...sourceFile.getImportDeclarations(),
      ...sourceFile.getExportDeclarations(),
    ];
    for (const decl of declarations) {
      const spec = decl.getModuleSpecifierValue();
      if (spec === undefined) continue;
      const next = rewriteSpecifier(spec, orig, dest, plan);
      if (next !== spec) decl.setModuleSpecifier(next);
    }
    rehomeSharedImports(sourceFile, dest);
    const upstreamPath = toPosix(path.relative(tree.root, orig));
    fs.writeFileSync(
      dest,
      header(tag, upstreamPath, dest) + sourceFile.getFullText(),
    );
  }
}

function applyPatches(): void {
  for (const patch of PATCHES) {
    const file = path.join(PKG_ROOT, patch.file);
    const text = fs.readFileSync(file, "utf8");
    const expected = patch.count ?? 1;
    const count = text.split(patch.find).length - 1;
    if (count !== expected) {
      throw new Error(
        `patch "${patch.why}" matched ${count} times in ${patch.file} (expected ${expected}); upstream changed, revisit it`,
      );
    }
    fs.writeFileSync(file, text.replaceAll(patch.find, patch.replace));
  }
}

function runEslintFix(): void {
  execFileSync(
    "pnpm",
    [
      "exec",
      "eslint",
      "--no-config-lookup",
      "--config",
      path.relative(PKG_ROOT, ESLINT_CONFIG),
      "--fix",
      "upstream",
      "test/upstream",
    ],
    { cwd: PKG_ROOT, stdio: "inherit" },
  );
}

function checkLicense(tree: Tree): { upstream: string; sha256: string } {
  const upstreamText = fs.readFileSync(path.join(tree.root, "LICENSE"), "utf8");
  const ours = fs.existsSync(LICENSE_FILE)
    ? fs.readFileSync(LICENSE_FILE, "utf8")
    : "";
  if (!ours.includes(upstreamText.trim())) {
    throw new Error(
      "LICENSE no longer carries the upstream MIT text verbatim; update it before syncing",
    );
  }
  return { upstream: "LICENSE", sha256: sha256(upstreamText) };
}

function writePackageJsonUpstream(manifest: Manifest): void {
  const file = path.join(PKG_ROOT, "package.json");
  const pkg = JSON.parse(fs.readFileSync(file, "utf8")) as Record<
    string,
    unknown
  >;
  const packages: Record<string, string> = {};
  for (const p of PACKAGES) {
    packages[manifest.packages[p.dir].name] = manifest.packages[p.dir].version;
  }
  pkg.upstream = {
    repository: manifest.repository,
    tag: manifest.tag,
    commit: manifest.commit,
    packages,
  };
  fs.writeFileSync(file, `${JSON.stringify(pkg, null, 2)}\n`);
}

function main(): void {
  const { tag, from } = parseArgs(process.argv.slice(2));
  const tree = obtainTree(tag, from);
  try {
    const license = checkLicense(tree);
    const plan = planCopies(tree);

    fs.rmSync(UPSTREAM_OUT, { recursive: true, force: true });
    fs.rmSync(TEST_OUT, { recursive: true, force: true });

    const manifest: Manifest = {
      repository: `https://github.com/${REPO_SLUG}`,
      tag,
      commit: tree.commit,
      date: tree.date,
      packages: {},
      license,
      files: [],
    };
    for (const pkg of PACKAGES) {
      const pkgJson = path.join(tree.root, pkg.upstreamDir, "package.json");
      manifest.packages[pkg.dir] = {
        upstreamDir: pkg.upstreamDir,
        name: pkg.specifier,
        version: readVersion(pkgJson),
      };
    }
    for (const [orig, dest] of plan) {
      const bytes = fs.readFileSync(orig);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, bytes);
      manifest.files.push({
        path: toPosix(path.relative(PKG_ROOT, dest)),
        upstream: toPosix(path.relative(tree.root, orig)),
        sha256: sha256(bytes),
      });
    }
    manifest.files.sort((a, b) => a.path.localeCompare(b.path));

    codemod(tree, tag, plan);
    fs.writeFileSync(
      path.join(UPSTREAM_OUT, "MANIFEST.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
    );
    runEslintFix();
    applyPatches();
    writePackageJsonUpstream(manifest);

    const sources = manifest.files.filter((f) =>
      f.path.startsWith("upstream/"),
    );
    const tests = manifest.files.length - sources.length;
    console.log(
      `synced ${REPO_SLUG}@${tag} (${tree.commit.slice(0, 12)}, ${tree.date}): ` +
        `${sources.length} source files, ${tests} test files, ${PATCHES.length} patches`,
    );
    for (const p of PACKAGES) {
      const m = manifest.packages[p.dir];
      console.log(`  ${m.name}@${m.version} <- ${m.upstreamDir}`);
    }
  } finally {
    tree.cleanup();
  }
}

main();
