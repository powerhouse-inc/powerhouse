// @ts-check
import { default as eslint } from "@eslint/js";
import betterTailwindcss from "eslint-plugin-better-tailwindcss";
import eslintPluginPrettierRecommended from "eslint-plugin-prettier/recommended";
import reactHooks from "eslint-plugin-react-hooks";
import { defineConfig, globalIgnores } from "eslint/config";
import globals from "globals";
import { builtinModules } from "node:module";
import path from "node:path";
import tseslint from "typescript-eslint";

const repoRoot = import.meta.dirname;

/** These files are typically ignored by eslint by default, so there is no need to investigate why they are ignored. */
const normalIgnoredFiles = [
  "**/node_modules/",
  "**/coverage/",
  "**/dist/",
  "**/.tsbuild/",
  "**/ts-build/",
  "**/storybook-static/",
  "**/.vite/",
  "**/.nx/",
  "**/build/",
  "**/.docusaurus/",
  "**/.ph/",
  "**/.hotseat/",
  "**/prisma/",
  // config artifacts
  "**/babel.config.js",
  "commitlint.config.cjs",
  // test artifacts
  "**/.out/",
  "**/test-output/",
  "**/.test-output/",
  "**/test-projects/",
  "**/flaky/",
  "apps/connect/lib/",
  // k6 scripts run in Goja, not Node — workspace globals (__ENV, console)
  // and rules aren't applicable.
  "apps/switchboard-lb/test/integration/*.js",
  "packages/reactor/bench/test/integration/*.js",
  "clis/ph-cli/src/commands/migrations/templates",
  // Stale code intentionally kept out of the active source tree (excluded
  // from tsconfig too); not type-checkable with the project service.
  "clis/ph-cmd/legacy/**",
  "**/coverage/",
  "**/playwright-report/",
  // test/package-e2e runtime artifacts (registry storage, CDN cache) and
  // fixtures that import from a generated project (not the workspace).
  "test/package-e2e/.registry-storage/",
  "test/package-e2e/.registry-cdn-cache/",
  "test/package-e2e/fixtures/",
  // Vendored scratch folder (sql-wasm typings + multi-MB SQL dumps); not
  // maintained source, so don't lint it.
  "packages/analytics-engine/browser/backup/",
];

/** These files need to be ignored for builds to pass, but they do not have clear reasons to be ignored.
 *
 * You can delete / comment out a file name or path and run `pnpm lint` to see the errors that surface.
 *
 * Please either:
 *
 * - Add a comment here why it needs to opt out of our linting rules
 * - Fix the code to be safe
 */
const unsafeIgnoredFiles = [
  // TODO: investigate why typescript disagrees with our storybook config
  "**/.storybook/",
  // TODO: investigate why our benchmark tests fail so many lint checks
  "**/*.bench.ts",
  // TODO: replace with something more robust
  "packages/codegen/src/codegen/.hygen/",
  // TODO: replace with something more robust
  "apps/connect/src/vite-env.d.ts",
  // TODO: these files had a blanket "eslint-disable" comment at the top and it was never re-enabled later in the file
  "packages/switchboard-gui/src/hooks/useAuth.ts",
  "packages/document-drive/src/storage/ipfs.ts",
  "packages/document-drive/src/utils/migrations.ts",
  // TODO: remove this once we have a better way to handle release scripts
  "tools/scripts/release.ts",
  "releases/release.ts",
  // TODO: remove this once we have a better way to handle external packages
  "**/external-packages.js",
  // Excluded from reactor's tsconfig.json, so ESLint's project service cannot parse it
  "packages/reactor/test/atlas/**/*",
  "packages/reactor-api/src/packages/vite-loader.mts",
  // Bootstrap .mjs for worker entry test; not part of TypeScript project service
  "packages/reactor/test/executor/worker/entry/worker-bootstrap.mjs",
];

/** All of the files that are ignored by eslint */
const ignoredFiles = [...normalIgnoredFiles, ...unsafeIgnoredFiles];

/** Global configs for eslint ignores */
const ignored = globalIgnores(ignoredFiles);

/** Typescript (`.ts`, `.mts`, `.cts`) files */
const typescriptFiles = ["**/*.ts", "**/*.mts", "**/*.cts"];

/** Typescript React (`.tsx`) files */
const typescriptReactFiles = ["**/*.tsx"];

/** Javascript (`.js`, `.cjs`, `.mjs`) files */
const javascriptFiles = ["**/*.js", "**/*.cjs", "**/*.mjs"];

/** All of the files with various eslint-disable comments are now kept here.
 *
 * You can delete / comment out a file name or path and run `pnpm lint` to see the errors that surface.
 *
 * You can see the specific rules that are disabled in this list below in the `unsafeRules` object.
 *
 * Please either:
 *
 * - Add a comment here why it needs to opt out of our linting rules
 * - Fix the code to be safe
 */
const filesWithUnsafeRules = [
  // it's probably fine to be less strict with academy
  "apps/academy/**/*",
  // our tests make heavy use of unsafe like `any` etc.
  // "**/test/*.ts",
  // "**/test/*.tsx",
  // "**/*.test.ts",
  // "**/*.test.tsx",
  // "**/*.bench.ts",
  // "**/__tests__/*.ts",
  "packages/reactor/test/**/*",
  "packages/reactor/**/*.test.ts",
  "packages/codegen/src/codegen/__tests__/data/**/*",
  "packages/document-drive/src/drive-document-model/src/tests/**/*",
  "packages/reactor-api/test/**/*",
  "packages/document-drive/test/**/*",
  "packages/reactor-mcp/test/**/*",
  "packages/vetra/editors/**/*.test.tsx",
  "packages/codegen/src/ts-morph-generator/__tests__/**/*",
  "apps/connect/cypress/e2e/**/*",
  // TODO: replace with something more robust
  "packages/document-drive/src/utils/logger.ts",
  // TODO: our generated code should not be unsafe
  "**/gen/*.ts",
  // TODO: figure out why the type of viteEnvs is unsafe
  "apps/connect/vite.config.ts",
  // TODO: replace codegen templates with something safe
  "packages/codegen/src/codegen/.hygen/templates/**/*",
  // TODO: file system utils call functions which are not implemented and just throw errors
  "packages/document-model/src/document/utils/file.ts",
  "apps/connect/scripts/render-skeleton.ts",
  "apps/connect/src/components/modal/modals/DebugSettingsModal.tsx",
  "apps/connect/src/context/read-mode.tsx",
  "packages/builder-tools/connect-studio/server.ts",
  "packages/codegen/src/codegen/hygen.ts",
  "packages/design-system/src/connect/components/toast/toast.stories.tsx",
  "clis/ph-cli/src/services/dev.ts",
  "packages/design-system/src/powerhouse/utils/fixedForwardRef.ts",
  "packages/design-system/src/ui/components/value-transformer/value-transformer.tsx",
  "packages/document-drive/src/processors/relational.ts",
  "packages/document-drive/src/server/transmitter/internal.ts",
  "packages/document-drive/src/utils/run-asap.ts",
  "packages/document-model/src/document/utils/document-helpers.ts",
  "packages/document-drive/src/utils/graphql.ts",
  "packages/reactor/src/events/types.ts",
  "packages/reactor-api/src/packages/util.ts",
  "packages/reactor-browser/src/context/read-mode.tsx",
  "packages/document-model/src/document/object.ts",
  "packages/switchboard-gui/src/components/header/header.tsx",
  "packages/reactor-mcp/src/server.ts",
  "packages/reactor-api/src/server.ts",
  "packages/reactor-api/src/graphql/index.ts",
  "packages/document-model/src/document/reducer.ts",
  "packages/document-drive/src/read-mode/server.ts",
  "packages/document-drive/src/queue/event.ts",
  "packages/document-model/src/document-model/custom/reducers/operation-error.ts",
  "packages/document-model/src/document-model/custom/reducers/operation-example.ts",
  "packages/analytics-engine/**/*",
];

/** Typescript rules that we have chosen to opt out of in general */
/** @type {import("eslint").Linter.RulesRecord} */
const typescriptRules = {
  "no-useless-assignment": "warn",
  "preserve-caught-error": "warn",
  "@typescript-eslint/consistent-type-imports": [
    "error",
    {
      prefer: "type-imports",
      disallowTypeAnnotations: true,
      fixStyle: "separate-type-imports",
    },
  ],
  // we need to use `any` in our over zealous generics
  "@typescript-eslint/no-explicit-any": "off",
  // we use things like _ as a placeholder for unused variables, so honour the
  // conventional `_`-prefix as an explicit "intentionally unused" marker.
  "@typescript-eslint/no-unused-vars": [
    "warn",
    {
      argsIgnorePattern: "^_",
      varsIgnorePattern: "^_",
      caughtErrorsIgnorePattern: "^_",
      destructuredArrayIgnorePattern: "^_",
    },
  ],
  // we have a lot of types that lie about whether they are optional or not
  "@typescript-eslint/no-unnecessary-condition": "warn",
  // async functions must contain an await; a synchronous implementation of an
  // async contract should return an explicit Promise (e.g. Promise.resolve)
  // rather than carry a no-op `async` keyword.
  "@typescript-eslint/require-await": "error",
  "@typescript-eslint/no-misused-promises": "warn",
  "@typescript-eslint/no-floating-promises": "warn",
  // our codegen uses this wrong type definition all over the place.
  // `with-single-extends` permits `interface A extends B {}` — a legitimate
  // pattern for named aliases, prop types, and global declaration merging
  // (e.g. augmenting `WindowEventMap`), which has no type-alias equivalent.
  "@typescript-eslint/no-empty-object-type": [
    "warn",
    { allowInterfaces: "with-single-extends" },
  ],
  // our overzealous generics force us to do this
  "@typescript-eslint/no-duplicate-type-constituents": "warn",
  // we use infinite loops
  "no-constant-condition": "off",
  // we use template literals with unsafe values
  "@typescript-eslint/restrict-template-expressions": [
    "warn",
    {
      allowNumber: true,
    },
  ],
  // our overzealous generics force us to do this
  "@typescript-eslint/no-unnecessary-type-assertion": "off",
  // our overzealous generics force us to do this
  "@typescript-eslint/no-unnecessary-type-parameters": "off",
  "@typescript-eslint/no-base-to-string": "warn",
};

/** Rules that we explicitly enable but are violated by our codebase.
 *
 * if code you wrote is being matched by the files list for these rules, please follow the instructions in the `filesWithUnsafeRules` object.
 */
/** @type {import("eslint").Linter.RulesRecord} */
const unsafeRules = {
  ...typescriptRules,
  "@typescript-eslint/no-unsafe-declaration-merging": "off",
  "@typescript-eslint/no-unsafe-assignment": "off",
  "@typescript-eslint/no-unsafe-member-access": "off",
  "@typescript-eslint/no-unsafe-call": "off",
  "@typescript-eslint/no-unsafe-return": "off",
  "@typescript-eslint/no-unsafe-argument": "off",
  "@typescript-eslint/await-thenable": "off",
  "@typescript-eslint/no-require-imports": "off",
  "@typescript-eslint/no-base-to-string": "off",
  "@typescript-eslint/unbound-method": "off",
  "@typescript-eslint/no-namespace": "off",
  "prefer-const": "off",
};

/** Language options for typescript files 
@type {import("eslint").Linter.LanguageOptions} */
const typescriptLanguageOptions = {
  sourceType: "module",
  ecmaVersion: "latest",
  globals: {
    ...globals.browser,
    ...globals.node,
  },
  parserOptions: {
    projectService: {
      allowDefaultProject: [
        "vitest.config.ts",
        "eslint.config.js",
        "mcr.config.js",
        "tools/scripts/merge-coverage.js",
        "test/scripts/analyze-ops.ts",
        "test/versioned-documents/vitest.config.ts",
        "test/ph-lora/scripts/check-pr-drift.ts",
        "test/ph-lora/scripts/validate-mapping.ts",
      ],
    },
    tsconfigRootDir: import.meta.dirname,
    ecmaFeatures: {
      jsx: true,
    },
  },
};

/** React settings */
const reactSettings = {
  react: {
    version: "detect",
  },
};

/** Typescript config for both `.ts` and `.tsx` files */
const typescriptConfig = {
  files: [...typescriptFiles, ...typescriptReactFiles],
  languageOptions: typescriptLanguageOptions,
  rules: typescriptRules,
};

/** React config for `.tsx` files */
const reactConfig = {
  ...reactHooks.configs.flat.recommended,
  files: typescriptReactFiles,
  settings: reactSettings,
};

/** Config for files that have unsafe rules enabled */
const unsafeConfig = {
  files: filesWithUnsafeRules,
  rules: unsafeRules,
};

/** Generated code emits `eslint-disable` directives defensively (e.g. the
 * graphql/zod codegen adds `no-empty-object-type` / `no-unused-vars` headers
 * to every schema file). Simple schemas don't trigger those rules, so the
 * directive reads as "unused" — but it's load-bearing for complex schemas.
 * Don't flag unused directives in generated files; the source of truth is the
 * codegen template, not the emitted file. */
const generatedFilesConfig = {
  files: ["**/gen/**/*.{ts,tsx}"],
  linterOptions: {
    reportUnusedDisableDirectives: "off",
  },
  rules: {
    // graphql-codegen legitimately emits `{}` for empty query variables and
    // default generic contexts; not worth fighting the generator over.
    "@typescript-eslint/no-empty-object-type": "off",
  },
};

/**
 * Custom rule: only allow static imports whose source matches the `allow`
 * list. Node built-ins, relative paths, and type-only imports are always
 * allowed. Everything else must use `await import(...)` or `import type`.
 *
 * `no-restricted-imports` is deny-list only — this gives us allow-list
 * semantics so the config lists what's permitted, not every heavy module
 * that isn't.
 */
const builtinSet = new Set(builtinModules);

// `importKind` is added by @typescript-eslint/parser
/** @typedef {{ importKind?: "type" | "value" }} HasImportKind */

/** @type {import("eslint").Rule.RuleModule} */
const allowedStaticImportsRule = {
  meta: {
    type: "problem",
    schema: [
      {
        type: "object",
        properties: {
          allow: { type: "array", items: { type: "string" } },
          message: { type: "string" },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      notAllowed:
        "{{message}} (`{{source}}` is not in the allow list; use `await import(...)` inside the command handler method)",
    },
  },
  create(context) {
    const opts = context.options[0] ?? {};
    const allow = opts.allow ?? [];
    const message = opts.message ?? "Static import not allowed here.";
    const isAllowedSource = (/** @type {string} */ src) => {
      if (src.startsWith("node:")) return true;
      if (builtinSet.has(src)) return true;
      if (
        src === "." ||
        src === ".." ||
        src.startsWith("./") ||
        src.startsWith("../")
      ) {
        return true;
      }
      return allow.some(
        (/** @type {string} */ name) =>
          src === name || src.startsWith(name + "/"),
      );
    };
    return {
      ImportDeclaration(node) {
        const decl = /** @type {typeof node & HasImportKind} */ (node);
        if (decl.importKind === "type") return;
        const hasValueSpecifier =
          node.specifiers.length === 0 ||
          node.specifiers.some(
            (s) =>
              /** @type {typeof s & HasImportKind} */ (s).importKind !== "type",
          );
        if (!hasValueSpecifier) return;
        const src = String(node.source.value);
        if (isAllowedSource(src)) return;
        context.report({
          node: node.source,
          messageId: "notAllowed",
          data: { source: src, message },
        });
      },
    };
  },
};

/**
 * `cli.ts` and command files in `clis/ph-cli` and `clis/ph-cmd` are
 * loaded eagerly on every CLI invocation. The `allow` array below is the
 * complete list of value imports permitted at module load — node
 * built-ins, relative paths, and type-only imports pass through
 * automatically. Everything else must use `await import(...)`.
 */
/** @type {import("eslint").Linter.RulesRecord} */
const cliColdPathRules = {
  "cli-cold-path/allowed-static-imports": [
    "error",
    {
      allow: [
        "cmd-ts",
        "@powerhousedao/shared/clis/args",
        "@powerhousedao/shared/clis/constants",
        "@powerhousedao/shared/clis/utils",
        "@powerhousedao/shared/clis/telemetry",
        "@powerhousedao/shared/clis/command-names",
        "@powerhousedao/shared/constants",
        "@powerhousedao/shared/processors",
      ],
      message: "Do not import modules statically on the CLI commands.",
    },
  ],
};

/**
 * Logger call-shape rules. The ConsoleLogger in `document-model` substitutes
 * `@token` placeholders in the message string with positional args (one per
 * unique token, in first-appearance order). Extra args past the unique-token
 * count are appended; missing args render as `"null"`.
 *
 * - missing-token-args (error): more `@token`s than args → `null` slot.
 * - extra-args-without-token (warn): no `@token`s but args passed → reads
 *   like a substitution that won't happen; encourage explicit tokens or
 *   inline interpolation.
 */
const LOGGER_METHODS = new Set(["verbose", "debug", "info", "warn", "error"]);

/** Heuristic: callee object identifier ends in "logger" (case-insensitive),
 *  or callee is `<...>.logger.<method>(...)`. */
const isLoggerCallee = (/** @type {any} */ callee) => {
  if (!callee || callee.type !== "MemberExpression" || callee.computed)
    return false;
  if (callee.property.type !== "Identifier") return false;
  if (!LOGGER_METHODS.has(callee.property.name)) return false;

  const obj = callee.object;
  if (obj.type === "Identifier") {
    return obj.name.toLowerCase().endsWith("logger");
  }
  if (obj.type === "MemberExpression" && !obj.computed) {
    if (obj.property.type === "Identifier") {
      return obj.property.name.toLowerCase().endsWith("logger");
    }
  }
  return false;
};

/** Extract a static message string from the first arg, or null if dynamic. */
const staticMessage = (/** @type {any} */ node) => {
  if (!node) return null;
  if (node.type === "Literal" && typeof node.value === "string")
    return node.value;
  if (node.type === "TemplateLiteral" && node.expressions.length === 0)
    return node.quasis
      .map((/** @type {any} */ q) => q.value.cooked ?? "")
      .join("");
  return null;
};

const countUniqueTokens = (/** @type {string} */ msg) => {
  const re = /@([a-zA-Z0-9_]+)/g;
  const seen = new Set();
  let m;
  while ((m = re.exec(msg)) !== null) seen.add(m[1]);
  return seen.size;
};

/** @type {import("eslint").Rule.RuleModule} */
const loggerMissingTokenArgsRule = {
  meta: {
    type: "problem",
    schema: [],
    messages: {
      missing:
        'logger.{{method}} message has {{tokens}} @token(s) but only {{args}} replacement arg(s) — missing slots render as "null".',
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        if (!isLoggerCallee(node.callee)) return;
        const msg = staticMessage(node.arguments[0]);
        if (msg === null) return;
        const tokens = countUniqueTokens(msg);
        const args = node.arguments.length - 1;
        if (args < tokens) {
          context.report({
            node,
            messageId: "missing",
            data: {
              method: /** @type {any} */ (node.callee).property.name,
              tokens: String(tokens),
              args: String(args),
            },
          });
        }
      },
    };
  },
};

/** @type {import("eslint").Rule.RuleModule} */
const loggerExtraArgsWithoutTokenRule = {
  meta: {
    type: "suggestion",
    schema: [],
    messages: {
      extra:
        "logger.{{method}} passes {{args}} arg(s) but the message has no @token placeholders — extras are appended at runtime; consider adding @tokens or inlining the value.",
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        if (!isLoggerCallee(node.callee)) return;
        const msg = staticMessage(node.arguments[0]);
        if (msg === null) return;
        const tokens = countUniqueTokens(msg);
        const args = node.arguments.length - 1;
        if (tokens === 0 && args > 0) {
          context.report({
            node,
            messageId: "extra",
            data: {
              method: /** @type {any} */ (node.callee).property.name,
              args: String(args),
            },
          });
        }
      },
    };
  },
};

/** @type {import("eslint").Linter.RulesRecord} */
const loggerRules = {
  "logger/missing-token-args": "error",
  "logger/extra-args-without-token": "warn",
};

const loggerRulesConfig = {
  files: typescriptFiles,
  plugins: {
    logger: {
      rules: {
        "missing-token-args": loggerMissingTokenArgsRule,
        "extra-args-without-token": loggerExtraArgsWithoutTokenRule,
      },
    },
  },
  rules: loggerRules,
};

const cliColdPathConfig = {
  files: [
    "clis/ph-cli/src/cli.ts",
    "clis/ph-cmd/src/cli.ts",
    "clis/ph-cli/src/commands/*.ts",
    "clis/ph-cmd/src/commands/*.ts",
  ],
  plugins: {
    "cli-cold-path": {
      rules: { "allowed-static-imports": allowedStaticImportsRule },
    },
  },
  rules: cliColdPathRules,
};

/** Config for javascript files */
const javascriptConfig = {
  // disable type aware linting for js files
  files: javascriptFiles,
  extends: [tseslint.configs.disableTypeChecked],
};

/** Recommended config from eslint */
const eslintRecommendedConfig = eslint.configs.recommended;

/** Recommended config from typescript-eslint */
const typescriptEsLintRecommendedConfig = [
  ...tseslint.configs.recommendedTypeChecked,
];

/** @type {import("eslint").Linter.RulesRecord} */
const tailwindRules = {
  ...betterTailwindcss.configs["recommended-error"].rules,
  "better-tailwindcss/enforce-consistent-line-wrapping": ["off"],
  "better-tailwindcss/no-unknown-classes": [
    "error",
    {
      ignore: [
        "custom-class",
        "hover-bg-transparent",
        "skeleton-loader",
        "home-screen",
      ],
    },
  ],
  // Forbid raw palette color classes (bg-gray-200, dark:text-slate-500, etc.) —
  // use the semantic theme tokens defined in packages/design-system/theme.css.
  "better-tailwindcss/no-restricted-classes": [
    "error",
    {
      restrict: [
        {
          pattern:
            "-(gray|slate|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|charcoal)-(50|100|200|300|400|500|600|700|800|900|950)(/[0-9]+)?!?$",
          message:
            "Don't use raw palette colors. Use a semantic theme token instead (e.g. bg-background, text-foreground, bg-secondary, text-muted-foreground, border-border, bg-warning) — see packages/design-system/theme.css.",
        },
      ],
    },
  ],
};

// Lint Tailwind classes inside `className` and any custom `*ClassName` prop
// (e.g. headerClassName, containerClassName, menuClassName).
const classAttributes = [
  "class",
  "className",
  ["^.*ClassName$", [{ match: "strings" }]],
];

const twSettings = (cwd, entryPoint) => ({
  "better-tailwindcss": {
    cwd: path.join(repoRoot, cwd),
    entryPoint,
    attributes: classAttributes,
  },
});

const tailwindConfig = [
  {
    files: ["packages/design-system/**/*.{js,jsx,cjs,mjs,ts,tsx}"],
    ignores: ["packages/design-system/src/powerhouse/components/legacy/**"],
    ...betterTailwindcss.configs["recommended-error"],
    rules: tailwindRules,
    settings: twSettings("packages/design-system", "storybook.css"),
  },
  {
    files: ["apps/connect/**/*.{js,jsx,cjs,mjs,ts,tsx}"],
    ...betterTailwindcss.configs["recommended-error"],
    rules: tailwindRules,
    settings: twSettings("apps/connect", "style.css"),
  },
  {
    files: ["packages/powerhouse-vetra-packages/**/*.{js,jsx,cjs,mjs,ts,tsx}"],
    ...betterTailwindcss.configs["recommended-error"],
    rules: tailwindRules,
    settings: twSettings("packages/design-system", "storybook.css"),
  },
  {
    files: ["packages/vetra/**/*.{js,jsx,cjs,mjs,ts,tsx}"],
    ...betterTailwindcss.configs["recommended-error"],
    rules: tailwindRules,
    settings: twSettings("packages/design-system", "storybook.css"),
  },
  {
    files: ["packages/switchboard-gui/**/*.{js,jsx,cjs,mjs,ts,tsx}"],
    ...betterTailwindcss.configs["recommended-error"],
    rules: tailwindRules,
    settings: twSettings("packages/switchboard-gui", "src/index.css"),
  },
];

/** Main config */
export default defineConfig(
  ignored,
  eslintRecommendedConfig,
  typescriptEsLintRecommendedConfig,
  eslintPluginPrettierRecommended,
  typescriptConfig,
  reactConfig,
  javascriptConfig,
  unsafeConfig,
  generatedFilesConfig,
  cliColdPathConfig,
  loggerRulesConfig,
  tailwindConfig,
);
