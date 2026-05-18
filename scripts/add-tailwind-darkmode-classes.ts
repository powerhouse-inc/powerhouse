import path from "node:path";
import {
  conditional,
  constant,
  endsWith,
  entries,
  filter,
  flatMap,
  forEach,
  hasAtLeast,
  isEmptyish,
  isNot,
  isStrictEqual,
  isString,
  join,
  map,
  mapValues,
  mergeAll,
  pipe,
  reduce,
  split,
  startsWith,
  unique,
  when,
} from "remeda";
import type { SourceFile, StringLiteral } from "ts-morph";
import { Project, SyntaxKind } from "ts-morph";
import { darkModeCandidateFiles } from "./dark-mode-candidate-files.js";

/** File suffixes that should never be processed by this migration script. */
const excludePatterns = [".css", "add-tailwind-darkmode-classes.ts"] as const;

/** Tailwind variant prefix used for dark-mode class names. */
const darkPrefix = "dark:" as const;

/** File exclusion patterns accepted by {@link shouldProcess}. */
type ExcludePatterns = typeof excludePatterns;

/** Absolute or relative path to a source file. */
type FilePath = string;

/** A single Tailwind class name. */
type ClassName = string;

/** A whitespace-split list of Tailwind class names. */
type ClassNameList = ClassName[];

/** Literal type for the configured {@link darkPrefix}. */
type DarkPrefix = typeof darkPrefix;

/** A Tailwind class name with the configured {@link darkPrefix} applied. */
type ClassNameWithDarkPrefix = `${DarkPrefix}${string}`;

/**
 * Mapping from a light-mode Tailwind class to its dark-mode replacement class,

 * before the `dark:` variant prefix is applied.
 */
type LightToDarkRecord = Record<ClassName, ClassName>;

/**
 * Runtime lookup map from light-mode classes to fully-prefixed dark-mode classes.
 */
type LightToDarkMap = Map<string, ClassNameWithDarkPrefix>;

/**
 * Light-to-dark mappings for text color classes.
 *
 * Values intentionally omit the {@link darkPrefix}; it is added later when the
 * runtime lookup map is created.
 */
const text = {
  "text-black": "text-slate-50",
  "text-gray-500": "text-slate-100",
  "text-gray-900": "text-slate-50",
  "text-gray-800": "text-slate-50",
  "text-gray-700": "text-slate-50",
  "text-gray-600": "text-slate-100",
  "text-gray-400": "text-slate-200",
  "text-red-900": "text-red-400",
  "text-red-800": "text-red-400",
  "text-red-700": "text-red-400",
  "text-red-600": "text-red-400",
  "text-red-500": "text-red-400",
  "text-yellow-900": "text-yellow-400",
  "text-yellow-800": "text-yellow-400",
  "text-yellow-700": "text-yellow-400",
  "text-green-900": "text-green-400",
  "text-green-700": "text-green-400",
  "text-green-600": "text-green-400",
  "text-blue-900": "text-blue-400",
  "text-blue-700": "text-blue-400",
  "text-blue-600": "text-blue-400",
  "text-slate-100": "text-gray-500",
  "text-slate-200": "text-gray-400",
} as const;

/**
 * Light-to-dark mappings for background color classes.
 *
 * Values intentionally omit the {@link darkPrefix}; it is added later when the
 * runtime lookup map is created.
 */
const bg = {
  "bg-white": "bg-slate-900",
  "bg-white/90": "bg-slate-900/90",
  "bg-gray-50": "bg-slate-800",
  "bg-gray-100": "bg-slate-700",
  "bg-gray-200": "bg-slate-600",
  "bg-slate-50": "bg-slate-800",
  "bg-slate-100": "bg-slate-700",
  "bg-red-50": "bg-red-900/20",
  "bg-red-100": "bg-red-900/30",
  "bg-yellow-50": "bg-yellow-900/20",
  "bg-yellow-100": "bg-yellow-900/30",
  "bg-yellow-400": "bg-yellow-900",
  "bg-blue-50": "bg-blue-900/20",
  "bg-blue-100": "bg-blue-900/30",
  "bg-blue-200": "bg-blue-800",
  "bg-blue-300": "bg-blue-700",
} as const;

/**
 * Light-to-dark mappings for border color classes.
 *
 * Values intentionally omit the {@link darkPrefix}; it is added later when the
 * runtime lookup map is created.
 */
const border = {
  "border-gray-100": "border-slate-700",
  "border-gray-200": "border-slate-700",
  "border-gray-300": "border-slate-600",
  "border-gray-400": "border-slate-500",
  "border-gray-500": "border-slate-400",
  "border-slate-50": "border-slate-700",
  "border-slate-100": "border-slate-700",
  "border-slate-200": "border-slate-600",
  "border-red-300": "border-red-800",
  "border-yellow-300": "border-yellow-800",
  "border-yellow-400": "border-yellow-700",
  "border-blue-300": "border-blue-700",
  "border-blue-500": "border-blue-600",
} as const;

/**
 * Light-to-dark mappings for hover variant text/background classes.
 *
 * Values intentionally omit the {@link darkPrefix}; it is added later when the
 * runtime lookup map is created.
 */
const hover = {
  "hover:bg-gray-50": "hover:bg-slate-800",
  "hover:bg-gray-100": "hover:bg-slate-700",
  "hover:bg-gray-200": "hover:bg-slate-600",
  "hover:bg-slate-50": "hover:bg-slate-800",
  "hover:bg-slate-100": "hover:bg-slate-700",
  "hover:text-gray-900": "hover:text-slate-50",
  "hover:text-gray-800": "hover:text-slate-50",
  "hover:text-gray-700": "hover:text-slate-100",
  "hover:text-gray-600": "hover:text-slate-100",
  "hover:text-gray-500": "hover:text-slate-100",
  "hover:bg-red-100": "hover:bg-red-900/30",
  "hover:bg-yellow-100": "hover:bg-yellow-900/30",
  "hover:bg-blue-50": "hover:bg-blue-900/20",
  "hover:bg-blue-100": "hover:bg-blue-900/30",
} as const;

/**
 * Adds the configured {@link darkPrefix} to a Tailwind class name.
 */
const addDarkPrefixToClass = (c: ClassName): ClassNameWithDarkPrefix =>
  `${darkPrefix}${c}` as const;

/**
 * Builds the runtime lookup map used by the migration.
 *
 * The input maps light-mode classes to unprefixed dark-mode equivalents. The
 * returned map stores the same light-mode keys with {@link darkPrefix}-prefixed values.
 */
const makeLightToDarkMap = (r: LightToDarkRecord) =>
  pipe(r, mapValues(addDarkPrefixToClass), entries(), (es) => new Map(es));

/**
 * Checks whether a class name has a configured dark-mode replacement.
 */
const hasMappedLightClass = (m: LightToDarkMap) => (c: ClassName) => m.has(c);

/**
 * Returns the configured dark-mode class for a light-mode class, if present.
 */
const getDarkClassForLightClass =
  (m: LightToDarkMap) =>
  (c: ClassName): ClassNameWithDarkPrefix | undefined =>
    m.get(c);

/**
 * Checks whether a string literal contains at least one light-mode class that
 * this migration knows how to convert.
 */
const hasLightMode = (m: LightToDarkMap) => (s: StringLiteral) =>
  pipe(
    s,
    getStringLiteralText,
    makeClassNameListFromString,
    filter(hasMappedLightClass(m)),
    hasAtLeast(1),
  );

/**
 * Splits a whitespace-delimited class string into individual class names.
 */
const makeClassNameListFromString = (c: ClassName): ClassNameList =>
  pipe(c.trim(), split(/\s+/), filter(isNot(isEmptyish)));

/**
 * Joins individual class names back into a whitespace-delimited class string.
 */
const makeClassNameStringFromList = (cs: ClassNameList): ClassName =>
  join(cs, " ");

/**
 * Checks whether a string literal already contains an explicit dark-mode class.
 *
 * Existing dark-mode classes are treated as intentional, so the migration skips
 * these literals instead of adding potentially-conflicting generated classes.
 */
const hasDarkModeAlready = (s: StringLiteral) =>
  pipe(
    s,
    getStringLiteralText,
    makeClassNameListFromString,
    filter(startsWith(darkPrefix)),
    isNot(isEmptyish),
  );

/**
 * Adds mapped dark-mode classes for every matching light-mode class in a class
 * list.
 *
 * Generated classes are appended to preserve the class ordering expected by the
 * formatter/linter.
 */
const addDarkModeClasses = (m: LightToDarkMap) => (cs: ClassNameList) =>
  reduce(
    cs,
    (acc, curr) =>
      pipe(
        curr,
        getDarkClassForLightClass(m),
        // add dark classes at the end of the list if found
        // to preserve the ordering desired by the linter / formatter
        conditional([isString, (cn) => [...acc, cn]], constant(acc)),
      ),
    cs,
  );

/**
 * Returns all string literal nodes in a source file.
 * */
const getStringLiterals = (f: SourceFile) =>
  f.getDescendantsOfKind(SyntaxKind.StringLiteral);

/**
 * Returns the raw text value of a string literal node.
 */
const getStringLiteralText = (s: StringLiteral) => s.getLiteralValue();

/**
 * Updates a string literal only when the new value differs from its current value.
 */
const maybeUpdateStringLiteral = (s: StringLiteral) => (c: ClassName) =>
  when(
    s,
    (s) => !isStrictEqual(c, getStringLiteralText(s)),
    (s) => s.setLiteralValue(c),
  );

/**
 * Adds missing generated dark-mode classes to a string literal, then updates
 * the AST node only if the literal value actually changed.
 */
const maybeAddNewClasses = (m: LightToDarkMap) => (s: StringLiteral) =>
  pipe(
    s,
    getStringLiteralText,
    makeClassNameListFromString,
    addDarkModeClasses(m),
    unique(),
    makeClassNameStringFromList,
    maybeUpdateStringLiteral(s),
  );

/**
 * Checks whether a file path should be processed by this migration.
 * */
const shouldProcess = (ex: ExcludePatterns) => (fp: FilePath) =>
  pipe(
    ex,
    filter((e) => endsWith(fp, e)),
    isEmptyish,
  );

/**
 * Adds a file path to the ts-morph project and returns the resulting source file.
 */
const addFileToProcess = (p: Project) => (fp: FilePath) =>
  p.addSourceFileAtPath(fp);

/**
 * Combined runtime lookup map for all configured light-to-dark class mappings.
 */
const lightToDarkMap = makeLightToDarkMap(mergeAll([text, bg, border, hover]));

/**
 * Minimal ts-morph project used for targeted AST edits.
 *
 * Files are added manually from `darkModeCandidateFiles`, so the project avoids
 * loading the full tsconfig file graph for performance.
 */
const project = new Project({
  tsConfigFilePath: path.join(process.argv[2] ?? ".", "tsconfig.json"),
  skipAddingFilesFromTsConfig: true,
  skipFileDependencyResolution: true,
  skipLoadingLibFiles: true,
});

/**
 * Migrates candidate string literals by adding generated dark-mode classes when:
 *
 * - the file is not excluded,
 * - the literal does not already contain an explicit `dark:` class,
 * - and the literal contains at least one configured light-mode class.
 */
pipe(
  darkModeCandidateFiles,
  filter(shouldProcess(excludePatterns)),
  map(addFileToProcess(project)),
  flatMap(getStringLiterals),
  filter(isNot(hasDarkModeAlready)),
  filter(hasLightMode(lightToDarkMap)),
  forEach(maybeAddNewClasses(lightToDarkMap)),
);

await project.save();
