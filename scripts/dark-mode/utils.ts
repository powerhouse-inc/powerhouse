import {
  conditional,
  constant,
  endsWith,
  entries,
  filter,
  hasAtLeast,
  isEmptyish,
  isNot,
  isString,
  join,
  mapValues,
  pipe,
  reduce,
  split,
  startsWith,
  unique,
} from "remeda";
import type { StringLiteral } from "ts-morph";
import { darkPrefix } from "./constants.js";
import { getStringLiteralText, maybeUpdateStringLiteral } from "./ts-morph.js";
import type {
  ClassName,
  ClassNameList,
  ClassNameWithDarkPrefix,
  ExcludePatterns,
  FilePath,
  LightToDarkMap,
  LightToDarkRecord,
} from "./types.js";

/**
 * Adds the configured {@link darkPrefix} to a Tailwind class name.
 */
export const addDarkPrefixToClass = (c: ClassName): ClassNameWithDarkPrefix =>
  `${darkPrefix}${c}` as const;

/**
 * Builds the runtime lookup map used by the migration.
 *
 * The input maps light-mode classes to unprefixed dark-mode equivalents. The
 * returned map stores the same light-mode keys with {@link darkPrefix}-prefixed values.
 */
export const makeLightToDarkMap = (r: LightToDarkRecord) =>
  pipe(r, mapValues(addDarkPrefixToClass), entries(), (es) => new Map(es));

/**
 * Checks whether a class name has a configured dark-mode replacement.
 */
export const hasMappedLightClass = (m: LightToDarkMap) => (c: ClassName) =>
  m.has(c);

/**
 * Returns the configured dark-mode class for a light-mode class, if present.
 */
export const getDarkClassForLightClass =
  (m: LightToDarkMap) =>
  (c: ClassName): ClassNameWithDarkPrefix | undefined =>
    m.get(c);

/**
 * Checks whether a string literal contains at least one light-mode class that
 * this migration knows how to convert.
 */
export const hasLightMode = (m: LightToDarkMap) => (s: StringLiteral) =>
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
export const makeClassNameListFromString = (c: ClassName): ClassNameList =>
  pipe(c.trim(), split(/\s+/), filter(isNot(isEmptyish)));

/**
 * Joins individual class names back into a whitespace-delimited class string.
 */
export const makeClassNameStringFromList = (cs: ClassNameList): ClassName =>
  join(cs, " ");

/**
 * Checks whether a string literal already contains an explicit dark-mode class.
 *
 * Existing dark-mode classes are treated as intentional, so the migration skips
 * these literals instead of adding potentially-conflicting generated classes.
 */
export const hasDarkModeAlready = (s: StringLiteral) =>
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
export const addDarkModeClasses = (m: LightToDarkMap) => (cs: ClassNameList) =>
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
 * Adds missing generated dark-mode classes to a string literal, then updates
 * the AST node only if the literal value actually changed.
 */
export const maybeAddNewClasses = (m: LightToDarkMap) => (s: StringLiteral) =>
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
export const shouldProcess = (ex: ExcludePatterns) => (fp: FilePath) =>
  pipe(
    ex,
    filter((e) => endsWith(fp, e)),
    isEmptyish,
  );
