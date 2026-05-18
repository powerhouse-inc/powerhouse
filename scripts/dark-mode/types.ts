import type { darkPrefix } from "./constants.js";

/** Absolute or relative path to a source file. */
export type FilePath = string;

/** A single Tailwind class name. */
export type ClassName = string;

/** A whitespace-split list of Tailwind class names. */
export type ClassNameList = ClassName[];

/** A record of class names to other class names. */
export type ClassNameRecord = Record<ClassName, ClassName | ClassNameList>;

/** A map of class names to other class names. */
export type ClassNameMap = Map<ClassName, ClassName | ClassNameList>;

/** Literal type for the configured {@link darkPrefix}. */
export type DarkPrefix = typeof darkPrefix;
