import type { darkPrefix, excludePatterns } from "./constants.js";

/** File exclusion patterns accepted by {@link shouldProcess}. */
export type ExcludePatterns = typeof excludePatterns;

/** Absolute or relative path to a source file. */
export type FilePath = string;

/** A single Tailwind class name. */
export type ClassName = string;

/** A whitespace-split list of Tailwind class names. */
export type ClassNameList = ClassName[];

/** Literal type for the configured {@link darkPrefix}. */
export type DarkPrefix = typeof darkPrefix;

/** A Tailwind class name with the configured {@link darkPrefix} applied. */
export type ClassNameWithDarkPrefix = `${DarkPrefix}${string}`;

/**
 * Mapping from a light-mode Tailwind class to its dark-mode replacement class,

 * before the `dark:` variant prefix is applied.
 */
export type LightToDarkRecord = Record<ClassName, ClassName>;

/**
 * Runtime lookup map from light-mode classes to fully-prefixed dark-mode classes.
 */
export type LightToDarkMap = Map<string, ClassNameWithDarkPrefix>;
