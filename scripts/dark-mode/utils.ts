import {
  conditional,
  constant,
  difference,
  dropLast,
  filter,
  flat,
  flatMap,
  hasAtLeast,
  identity,
  isDefined,
  isEmptyish,
  isNot,
  join,
  map,
  mapKeys,
  mapValues,
  pipe,
  split,
  startsWith,
  unique,
} from "remeda";
import type { NoSubstitutionTemplateLiteral, StringLiteral } from "ts-morph";
import { darkPrefix } from "./constants.js";
import { getStringLiteralText, maybeUpdateStringLiteral } from "./ts-morph.js";
import type {
  ClassName,
  ClassNameList,
  ClassNameMap,
  ClassNameSet,
} from "./types.js";

/**
 * Splits a whitespace-delimited class string into individual class names.
 */
export const makeClassNameListFromString = (c: ClassName): ClassNameList =>
  pipe(
    c.trim(),
    split(/\s+/),
    filter((c) => c !== " "),
    filter(isNot(isEmptyish)),
  );

/**
 * Joins individual class names back into a whitespace-delimited class string.
 */
export const makeClassNameStringFromList = (cs: ClassNameList): ClassName =>
  pipe(
    cs,
    filter((c) => c !== " "),
    filter(isNot(isEmptyish)),
    join(" "),
  );

export const hasClass = (m: ClassNameMap | ClassNameSet) => (c: ClassName) =>
  m.has(c);

/**
 * Checks whether a string literal contains at least one light-mode class that
 * this migration knows how to convert.
 */
export const hasClasses =
  (m: ClassNameMap | ClassNameSet) =>
  (s: StringLiteral | NoSubstitutionTemplateLiteral) =>
    pipe(
      s,
      getStringLiteralText,
      makeClassNameListFromString,
      filter(hasClass(m)),
      hasAtLeast(1),
    );

export const getClasses =
  (m: ClassNameMap) =>
  (c: ClassName): ClassNameList =>
    pipe([m.get(c)], flat(), filter(isDefined));

export const replaceClass = (m: ClassNameMap) => (c: ClassName) =>
  pipe(c, getClasses(m), conditional([hasAtLeast(1), identity()], constant(c)));

export const replaceClasses = (m: ClassNameMap) => (cs: ClassNameList) =>
  flatMap(cs, replaceClass(m));

export const getStringLiteralClassNameList = (
  s: StringLiteral | NoSubstitutionTemplateLiteral,
) => pipe(s, getStringLiteralText, makeClassNameListFromString);

export const updateClassesForStringLiteral =
  (s: StringLiteral | NoSubstitutionTemplateLiteral) => (cs: ClassNameList) =>
    pipe(
      cs,
      unique(),
      makeClassNameStringFromList,
      maybeUpdateStringLiteral(s),
    );

/**
 * Adds missing generated dark-mode classes to a string literal, then updates
 * the AST node only if the literal value actually changed.
 */
export const addClassesToStringLiteral =
  (m: ClassNameMap) => (s: StringLiteral | NoSubstitutionTemplateLiteral) =>
    pipe(
      s,
      getStringLiteralClassNameList,
      updateClasses(m),
      updateClassesForStringLiteral(s),
    );

export const replaceClassesForStringLiteral =
  (m: ClassNameMap) => (s: StringLiteral | NoSubstitutionTemplateLiteral) =>
    pipe(
      s,
      getStringLiteralClassNameList,
      replaceClasses(m),
      updateClassesForStringLiteral(s),
    );

export const removeClassesFromStringLiteral =
  (toRemove: ClassNameList) =>
  (s: StringLiteral | NoSubstitutionTemplateLiteral) =>
    pipe(
      s,
      getStringLiteralClassNameList,
      difference(toRemove),
      updateClassesForStringLiteral(s),
    );

export const withPrefix = <C extends ClassName, P extends `${string}:`>(
  p: P,
  c: C,
) => `${p}${c}` as const;

export const withSuffix = <C extends ClassName, S extends string>(s: S, c: C) =>
  `${c}${s}` as const;

export const addSuffix =
  <C extends ClassName, S extends string>(s: S) =>
  (c: C) =>
    withSuffix(s, c);

export const addPrefix =
  <C extends ClassName, P extends `${string}:`>(p: P) =>
  (c: C) =>
    withPrefix(p, c);

/**
 * Checks whether a string literal already contains an explicit dark-mode class.
 *
 * Existing dark-mode classes are treated as intentional, so the migration skips
 * these literals instead of adding potentially-conflicting generated classes.
 */
export const hasDarkModeAlready = (
  s: StringLiteral | NoSubstitutionTemplateLiteral,
) =>
  pipe(
    s,
    getStringLiteralClassNameList,
    filter(startsWith(darkPrefix)),
    isNot(isEmptyish),
  );

export const dropLastPartOfClassName = (c: ClassName) =>
  pipe(c, split("-"), dropLast(2), join("-"));

export const matchClasses = (m: ClassNameMap, cs: ClassNameList) =>
  pipe(cs, flatMap(getClasses(m)), unique());

export const updateClasses = (m: ClassNameMap) => (cs: ClassNameList) => {
  const matches = matchClasses(m, cs);
  const withLastDropped = pipe(matches, map(dropLastPartOfClassName), unique());
  const withUpdatedClassesRemoved = filter(
    cs,
    (c) => !withLastDropped.some((l) => c.startsWith(l)),
  );
  return unique([...withUpdatedClassesRemoved, ...matches]);
};

export const makeAncillaryClasses = (mappings: Record<string, string>) => {
  const hover: Record<string, string> = pipe(
    mappings,
    mapKeys(addPrefix("hover:")),
    mapValues(addPrefix("hover:")),
  );
  const group: Record<string, string> = pipe(
    mappings,
    mapKeys(addPrefix("group-hover:")),
    mapValues(addPrefix("group-hover:")),
  );

  const placeholder: Record<string, string> = pipe(
    mappings,

    mapKeys(addPrefix("placeholder:")),
    mapValues(addPrefix("placeholder:")),
  );

  const focus: Record<string, string> = pipe(
    mappings,
    mapKeys(addPrefix("focus:")),
    mapValues(addPrefix("focus:")),
  );

  const focusWithin: Record<string, string> = pipe(
    mappings,
    mapKeys(addPrefix("focus-within:")),
    mapValues(addPrefix("focus-within:")),
  );

  const focusVisible: Record<string, string> = pipe(
    mappings,
    mapKeys(addPrefix("focus-visible:")),
    mapValues(addPrefix("focus-visible:")),
  );

  const even: Record<string, string> = pipe(
    mappings,
    mapKeys(addPrefix("even:")),
    mapValues(addPrefix("even:")),
  );

  const odd: Record<string, string> = pipe(
    mappings,
    mapKeys(addPrefix("odd:")),
    mapValues(addPrefix("odd:")),
  );

  const before: Record<string, string> = pipe(
    mappings,
    mapKeys(addPrefix("before:")),
    mapValues(addPrefix("before:")),
  );

  const after: Record<string, string> = pipe(
    mappings,
    mapKeys(addPrefix("after:")),
    mapValues(addPrefix("after:")),
  );

  const active: Record<string, string> = pipe(
    mappings,
    mapKeys(addPrefix("active:")),
    mapValues(addPrefix("active:")),
  );

  const disabled: Record<string, string> = pipe(
    mappings,
    mapKeys(addPrefix("disabled:")),
    mapValues(addPrefix("disabled:")),
  );

  return {
    ...mappings,
    ...hover,
    ...group,
    ...placeholder,
    ...focus,
    ...focusWithin,
    ...even,
    ...odd,
    ...before,
    ...after,
    ...active,
    ...disabled,
  };
};
