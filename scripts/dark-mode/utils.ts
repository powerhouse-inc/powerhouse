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
  isEmptyish,
  isNot,
  isTruthy,
  join,
  map,
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
  (m: ClassNameMap | ClassNameSet) => (s: StringLiteral) =>
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
    pipe([m.get(c)], flat(), filter(isTruthy));

export const replaceClass = (m: ClassNameMap) => (c: ClassName) =>
  pipe(c, getClasses(m), conditional([hasAtLeast(1), identity()], constant(c)));

export const replaceClasses = (m: ClassNameMap) => (cs: ClassNameList) =>
  flatMap(cs, replaceClass(m));

export const getStringLiteralClassNameList = (s: StringLiteral) =>
  pipe(s, getStringLiteralText, makeClassNameListFromString);

export const updateClassesForStringLiteral =
  (s: StringLiteral) => (cs: ClassNameList) =>
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
  (m: ClassNameMap) => (s: StringLiteral) =>
    pipe(
      s,
      getStringLiteralClassNameList,
      updateClasses(m),
      updateClassesForStringLiteral(s),
    );

export const replaceClassesForStringLiteral =
  (m: ClassNameMap) => (s: StringLiteral) =>
    pipe(
      s,
      getStringLiteralClassNameList,
      replaceClasses(m),
      updateClassesForStringLiteral(s),
    );

export const removeClassesFromStringLiteral =
  (toRemove: ClassNameList) => (s: StringLiteral) =>
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
export const hasDarkModeAlready = (s: StringLiteral) =>
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
