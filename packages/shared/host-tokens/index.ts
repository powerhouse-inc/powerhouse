import { z } from "zod";

/**
 * Output tokens (typed-host-configs G3): plain-JSON operators a host file
 * uses to consume values another host's creation produces. An object whose
 * SOLE key is one of TOKEN_KEYS is an operator; `$$` escapes a literal
 * `$`-prefixed sole key. Host-core fields accept them through `tokenable()`
 * (declared form); host-core's `resolveHostOutputs` replaces them before a
 * verb runs, and `validateHost` rejects any that remain.
 *
 * `@powerhousedao/shared/host-tokens`: zod only, no `node:` import (a test
 * walks the import graph), so Connect's config schema (../connect/) can
 * declare token-able fields; `@powerhousedao/host-core` re-exports all of it.
 */

export type OutputPath = (string | number)[];

/* The phantom brand key `"~value"` of `OutputToken<T>` / `ItemToken<T>` (type level
 * only; no runtime object has it). A STRING key, not a `unique symbol`: the
 * dts bundler copies this file into more than one chunk (`./schema` and
 * `.`), and two `unique symbol`s would make two unrelated brands, so an
 * `ItemToken<string>` from `outputs.d.ts` (`./schema`) would fit a boolean
 * field typed through `.`. */

/** `{ $output: { host, member?, path } }` — the value at `path` in that
 * host's outputs. `T` is a phantom brand for generated `outputs.d.ts`. */
export interface OutputToken<T = unknown> {
  $output: { host: string; member?: string; path: OutputPath };
  readonly "~value"?: T;
}

/** `{ $concat: [...] }` — a string; every part resolves to string|number. */
export interface ConcatToken {
  $concat: (string | number | Token)[];
}

/** `$item` inside a `$map` template: the current element (innermost map, or
 * the named outer binding). */
export interface ItemToken<T = unknown> {
  $item: OutputPath | { as: string; path: OutputPath };
  readonly "~value"?: T;
}

/** `$key` inside a `$map` template: the current key (`true` = innermost). */
export interface KeyToken {
  $key: true | string;
}

/** `{ $map: { over, as?, to, into? } }`: `to` rendered once per element of
 * `over` (arrays in order, records key-sorted); an array, or a record
 * keeping the input keys with `into: "record"` (3.3). */
export interface MapToken<To = unknown> {
  $map: {
    over: OutputToken | ItemToken;
    as?: string;
    to: To;
    into?: "record";
  };
}

/** `{ $env: "NAME" }` or `{ $env: { name, optional: true } }`. */
export interface EnvToken {
  $env: string | { name: string; optional: true };
}

export type Token =
  | OutputToken
  | ConcatToken
  | MapToken
  | ItemToken
  | KeyToken
  | EnvToken;

export const TOKEN_KEYS = [
  "$output",
  "$concat",
  "$map",
  "$item",
  "$key",
  "$env",
] as const;

export type TokenKey = (typeof TOKEN_KEYS)[number];

/** The escape key: `{ $$: { $output: … } }` is the literal object. */
export const TOKEN_ESCAPE_KEY = "$$";

/* ------------------------------------------------------------- field typing */

/** A value with the (untyped) tokens of its own union removed: what a
 * token in that position must produce. */
type Untokened<T> = Exclude<T, Token>;

/** What `{ $key: true }` reads inside a `$map` template: the innermost
 * map's key, a number over an array and a string over a record. */
type MapKey = string | number;

/** A branded array `over` (an `ItemToken<X[]>` from outputs.d.ts). */
type ArrayOver =
  | OutputToken<readonly unknown[]>
  | ItemToken<readonly unknown[]>;
/** A branded record `over`. An array does not fit it (no string index). */
type RecordOver =
  | OutputToken<Readonly<Record<string, unknown>>>
  | ItemToken<Readonly<Record<string, unknown>>>;

/**
 * `$map` producing an array of `E` (no `into`). `$key: true` in `to` reads
 * a number over an array and a string over a record, so its slot is typed
 * by the `over`: a branded array `over` keeps `$key` out of string slots.
 * A hand-written `$output` literal carries no brand and fits both forms;
 * there, a misplaced `$key` fails at resolved validation instead.
 */
export type ArrayMapToken<E> =
  | {
      $map: {
        over: ArrayOver;
        as?: string;
        to: Template<E, number>;
        into?: never;
      };
    }
  | {
      $map: {
        over: RecordOver;
        as?: string;
        to: Template<E, string>;
        into?: never;
      };
    };

/** `$map` producing a record of `V` (`into: "record"`, record `over`). */
export interface RecordMapToken<V> {
  $map: {
    over: RecordOver;
    as?: string;
    to: Template<V, string>;
    into: "record";
  };
}

type MapTokenFor<T> = T extends readonly unknown[]
  ? ArrayMapToken<T[number]>
  : T extends object
    ? string extends keyof T
      ? RecordMapToken<T[string & keyof T]>
      : never
    : never;

/** `true` when some member of `K` fits `T` (else `never`). */
type SomeFits<K, T> = K extends T ? true : never;

/** The `$key` tokens that fit `T`: `{ $key: true }` (the innermost map's
 * key, typed `K`) and `{ $key: "<as>" }` (a named outer map's key, whose
 * type is not tracked: a string or a number). */
type KeyTokenFor<T, K extends MapKey> =
  | ([SomeFits<K, T>] extends [never] ? never : { $key: true })
  | ([SomeFits<MapKey, T>] extends [never] ? never : { $key: string });

/**
 * The tokens that may stand where a value of type `T` is expected:
 * `$output`/`$item` whose (branded) value fits `T` (a hand-written literal
 * carries no brand and fits anywhere; the loader checks its path),
 * `$concat`/`$env` where a string fits, `$key` where the key fits (`K`: the
 * innermost `$map`'s key type inside a template), and `$map` where `T` is
 * an array (or, `into: "record"`, a record).
 */
export type TokenFor<T, K extends MapKey = MapKey> = unknown extends T
  ? Token
  :
      | OutputToken<T>
      | ItemToken<T>
      | (string extends T ? ConcatToken | EnvToken : never)
      | KeyTokenFor<T, K>
      | MapTokenFor<T>;

/**
 * A `$map` template for an element of type `T`: `T`'s shape with a fitting
 * token allowed at EVERY position (the rendered element is validated
 * against the field's schema after resolution, so non-ref fields such as a
 * drive `slug` may take `$key`/`$item` here). `K` is the type `$key: true`
 * reads (see {@link ArrayMapToken}).
 */
export type Template<T, K extends MapKey = MapKey> =
  | TokenFor<Untokened<T>, K>
  | TemplateShape<Untokened<T>, K>;

type TemplateShape<T, K extends MapKey> = T extends readonly unknown[]
  ? Template<T[number], K>[]
  : T extends object
    ? { [P in keyof T]: TemplateSlot<T[P], K> }
    : T;

/** One property of a template. Its tokens may produce `undefined` where
 * the property is optional (a codegen'd `ItemToken<X | undefined>`: the
 * rendered property is then left out), but the property is never written
 * as a literal `undefined`: a host file is JSON, so an optional property is
 * omitted instead (enforced by the type under exactOptionalPropertyTypes,
 * which generated hosts/tsconfig.json enables). */
type TemplateSlot<V, K extends MapKey> =
  | TokenFor<Untokened<V>, K>
  | TemplateShape<Exclude<Untokened<V>, undefined>, K>;

/* ------------------------------------------------------------------ schemas */

const outputPathSchema = z.array(z.union([z.string(), z.number().int()]));

export const outputTokenSchema = z.strictObject({
  $output: z.strictObject({
    host: z.string().min(1),
    member: z.string().min(1).optional(),
    path: outputPathSchema,
  }),
});

export const itemTokenSchema = z.strictObject({
  $item: z.union([
    outputPathSchema,
    z.strictObject({ as: z.string().min(1), path: outputPathSchema }),
  ]),
});

export const keyTokenSchema = z.strictObject({
  $key: z.union([z.literal(true), z.string().min(1)]),
});

export const envTokenSchema = z.strictObject({
  $env: z.union([
    z.string().min(1),
    z.strictObject({ name: z.string().min(1), optional: z.literal(true) }),
  ]),
});

export const mapTokenSchema = z.strictObject({
  $map: z.strictObject({
    over: z.union([outputTokenSchema, itemTokenSchema]),
    as: z.string().min(1).optional(),
    to: z.unknown(),
    into: z.literal("record").optional(),
  }),
});

// $concat parts may themselves be tokens: the recursive member is lazy.
export const concatTokenSchema: z.ZodType<ConcatToken, ConcatToken> =
  z.strictObject({
    $concat: z.array(
      z.union([z.string(), z.number(), z.lazy(() => tokenSchema)]),
    ),
  });

export const tokenSchema: z.ZodType<Token, Token> = z.union([
  outputTokenSchema,
  concatTokenSchema,
  mapTokenSchema,
  itemTokenSchema,
  keyTokenSchema,
  envTokenSchema,
]);

/* ---------------------------------------------------------------- detection */

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/** The operator key of a token-shaped value (sole key among TOKEN_KEYS), or
 * undefined. Shape-level only: the operand is not validated here. */
export function tokenKeyOf(value: unknown): TokenKey | undefined {
  if (!isPlainObject(value)) return undefined;
  const keys = Object.keys(value);
  if (keys.length !== 1) return undefined;
  return TOKEN_KEYS.find((key) => key === keys[0]);
}

export function isToken(value: unknown): boolean {
  return tokenKeyOf(value) !== undefined;
}

/** The path (`a.b[2].c`) of the first token in a JSON-shaped value, or
 * undefined. A `$$` escape hides its operand from the walk. */
export function findToken(
  value: unknown,
  trail = "",
): { path: string; key: TokenKey } | undefined {
  const key = tokenKeyOf(value);
  if (key) return { path: trail || "<root>", key };
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const hit = findToken(value[i], `${trail}[${i}]`);
      if (hit) return hit;
    }
    return undefined;
  }
  if (!isPlainObject(value)) return undefined;
  const keys = Object.keys(value);
  if (keys.length === 1 && keys[0] === TOKEN_ESCAPE_KEY) return undefined;
  for (const [childKey, child] of Object.entries(value)) {
    const hit = findToken(child, trail ? `${trail}.${childKey}` : childKey);
    if (hit) return hit;
  }
  return undefined;
}

/* ------------------------------------------------------- $map placement */

// A `$map` renders an array (a record with `into: "record"`), so it fits
// only a field holding one. Token-able fields accept every token shape at
// runtime (the field's own schema checks the rendered value at resolved
// validation); this check catches a `$map` in a non-collection field at
// DECLARED validation instead, inside `$map` templates too (their `to` is
// not parsed until rendered).

/** The value schema behind a token-able field (`ref` / `tokenable`), so a
 * template can be checked against what its fields hold. */
const tokenableValue = new WeakMap<object, unknown>();

type ZodDef = Record<string, unknown> & { type: string };

function defOf(schema: unknown): ZodDef | undefined {
  if (schema === null || typeof schema !== "object") return undefined;
  const internals = (schema as { _zod?: unknown })._zod;
  if (internals === null || typeof internals !== "object") return undefined;
  const def = (internals as { def?: unknown }).def;
  if (def === null || typeof def !== "object") return undefined;
  const type = (def as { type?: unknown }).type;
  return typeof type === "string" ? { ...def, type } : undefined;
}

const WRAPPERS = new Set([
  "optional",
  "nullable",
  "default",
  "prefault",
  "readonly",
  "nonoptional",
  "catch",
]);

const SCALARS = new Set([
  "string",
  "number",
  "int",
  "boolean",
  "bigint",
  "date",
  "enum",
  "literal",
  "null",
  "nan",
  "template_literal",
]);

/** What a field holds, as far as its schema tells. */
type FieldShape =
  | { kind: "array"; element: unknown }
  | { kind: "record"; value: unknown }
  | { kind: "object"; shape: Record<string, unknown> }
  | { kind: "scalar"; type: string }
  | { kind: "unknown" };

/** `schema` without wrappers: optional & co, lazy, a pipe's input, a
 * token-able field's token branch and a one-option union. */
function unwrapField(schema: unknown): unknown {
  let current = schema;
  for (let guard = 0; guard < 32; guard++) {
    if (
      current !== null &&
      typeof current === "object" &&
      tokenableValue.has(current)
    ) {
      current = tokenableValue.get(current);
      continue;
    }
    const def = defOf(current);
    if (!def) return current;
    if (WRAPPERS.has(def.type)) current = def.innerType;
    else if (def.type === "lazy" && typeof def.getter === "function") {
      current = (def.getter as () => unknown)();
    } else if (def.type === "pipe") current = def.in;
    else if (
      def.type === "union" &&
      Array.isArray(def.options) &&
      def.options.length === 1
    ) {
      current = def.options[0];
    } else return current;
  }
  return current;
}

function fieldShapeOf(schema: unknown): FieldShape {
  const def = defOf(unwrapField(schema));
  if (!def) return { kind: "unknown" };
  if (def.type === "array") return { kind: "array", element: def.element };
  if (def.type === "tuple") return { kind: "array", element: undefined };
  if (def.type === "record") return { kind: "record", value: def.valueType };
  if (def.type === "object") {
    const shape = isPlainObject(def.shape) ? def.shape : {};
    const catchall = defOf(def.catchall);
    if (catchall && catchall.type !== "never") {
      return {
        kind: "record",
        value: Object.keys(shape).length === 0 ? def.catchall : undefined,
      };
    }
    return { kind: "object", shape };
  }
  if (SCALARS.has(def.type)) return { kind: "scalar", type: def.type };
  return { kind: "unknown" };
}

interface PlacementIssue {
  path: (string | number)[];
  message: string;
}

/** Every `$map` in `value` (a field value, or a template inside one) that
 * renders a collection its field cannot hold. Paths end at the `$map`
 * operand (`…url.$map`), whose message the host error keeps. */
function mapPlacementIssues(
  value: unknown,
  schema: unknown,
  path: (string | number)[],
  issues: PlacementIssue[],
): void {
  const key = tokenKeyOf(value);
  if (key === "$map") {
    const operand = (value as { $map: unknown }).$map;
    if (!isPlainObject(operand)) return; // malformed: reported elsewhere
    const into = operand.into === "record";
    const field = fieldShapeOf(schema);
    const at = [...path, "$map"];
    const renders = into ? 'a record (into: "record")' : "an array";
    if (field.kind === "scalar" || field.kind === "object") {
      const holds = field.kind === "object" ? "an object" : `a ${field.type}`;
      issues.push({
        path: at,
        message: `a $map renders ${renders}, but this field holds ${holds}. A $map fills only a list field (or, with into: "record", a record field).`,
      });
      return;
    }
    if (field.kind === "array" && into) {
      issues.push({
        path: at,
        message:
          'a $map with into: "record" renders a record, but this field holds an array. Drop into: "record".',
      });
      return;
    }
    if (field.kind === "record" && !into) {
      issues.push({
        path: at,
        message:
          'a $map renders an array, but this field holds a record. Add into: "record" (and map over a record).',
      });
      return;
    }
    const element =
      field.kind === "array"
        ? field.element
        : field.kind === "record"
          ? field.value
          : undefined;
    if (element !== undefined) {
      mapPlacementIssues(operand.to, element, [...at, "to"], issues);
    }
    return;
  }
  if (key) return;
  if (Array.isArray(value)) {
    const field = fieldShapeOf(schema);
    if (field.kind !== "array" || field.element === undefined) return;
    value.forEach((item, index) =>
      mapPlacementIssues(item, field.element, [...path, index], issues),
    );
    return;
  }
  if (!isPlainObject(value)) return;
  const keys = Object.keys(value);
  if (keys.length === 1 && keys[0] === TOKEN_ESCAPE_KEY) return;
  const field = fieldShapeOf(schema);
  for (const [childKey, child] of Object.entries(value)) {
    const childSchema =
      field.kind === "object"
        ? field.shape[childKey]
        : field.kind === "record"
          ? field.value
          : undefined;
    if (childSchema !== undefined) {
      mapPlacementIssues(child, childSchema, [...path, childKey], issues);
    }
  }
}

/** Adds the `$map` placement check to a token-able field's union. Only a
 * value the union accepted reaches it, so a `$map` here came through the
 * token branch. */
function withMapPlacement<U extends z.ZodType>(schema: z.ZodType, union: U): U {
  const checked = union.superRefine((value, ctx) => {
    if (tokenKeyOf(value) !== "$map") return;
    const issues: PlacementIssue[] = [];
    mapPlacementIssues(value, schema, [], issues);
    for (const issue of issues) {
      ctx.addIssue({
        code: "custom",
        path: issue.path,
        message: issue.message,
      });
    }
  });
  tokenableValue.set(checked, schema);
  return checked;
}

/* ---------------------------------------------------------------------- ref */

/** A token-able field: `T | Token` (declared form). Host schemas take it
 * through `makeHostSchemas`' ref function; plugin configSchemas use it
 * directly. */
export function ref<S extends z.ZodType>(
  schema: S,
): z.ZodUnion<[S, z.ZodType<Token, TokenFor<Untokened<z.input<S>>>>]> {
  // Same runtime schema; the token option's INPUT type is narrowed to the
  // tokens that fit the field (its output stays `Token`).
  const token = tokenSchema as z.ZodType<
    Token,
    TokenFor<Untokened<z.input<S>>>
  >;
  return withMapPlacement(schema, z.union([schema, token]));
}

/** Resolved form of a ref field: tokens are not accepted. */
export function forbidRef<S extends z.ZodType>(schema: S): S {
  return schema;
}

export type TokenMode = "allow" | "forbid";
export type RefFn = typeof ref | typeof forbidRef;

/** A token-able host field as runners see it: authors may write `T | Token`
 * (z.input), verbs receive `T` (z.output). */
export type TokenableSchema<
  S extends z.ZodType,
  K = TokenFor<Untokened<z.input<S>>>,
> = z.ZodType<z.output<S>, z.input<S> | K>;

/** A schema set's wrapper for its token-able fields: `tokenable` in the
 * declared form, a plain one-option union in the resolved form (host-core's
 * `s.tokenable`). Both share this static type: declared input, resolved
 * output. */
export type TokenField = <S extends z.ZodType>(schema: S) => TokenableSchema<S>;

// The token branch's output is `never`, so a field's z.output stays the
// resolved type. At runtime a token passes through untouched: declared
// validation accepts it here, and validateHost's no-token walk (plus
// resolveHostOutputs before it) guarantees a verb never receives one.
const passthrough = <K extends Token>(schema: z.ZodType<K, K>) =>
  schema.pipe(z.custom<never>());

/**
 * The host-core field wrapper (declared input, resolved output): accepts
 * `T` or an output token that fits it (`TokenFor<T>`: `$output`, `$concat`,
 * `$env`, `$map` for a collection, …). Plugin
 * configSchemas keep using `ref()`; this is for schemas whose verbs must see
 * resolved types (the base host schemas every runner extends).
 */
export function tokenable<S extends z.ZodType>(schema: S): TokenableSchema<S> {
  // Every token passes at runtime (declared validation checks paths and
  // bindings; resolved validation the values); the static input admits only
  // the tokens that fit the field (`TokenFor`).
  const token = passthrough(tokenSchema) as z.ZodType<
    never,
    TokenFor<Untokened<z.input<S>>>
  >;
  return withMapPlacement(schema, z.union([schema, token]));
}

/** Like `tokenable`, but the only token accepted is `$env` (e.g.
 * `storage.dataDir`: a path is an environment fact, never another host's
 * output). */
export function envTokenable<S extends z.ZodType>(
  schema: S,
): TokenableSchema<S, EnvToken> {
  return z.union([schema, passthrough<EnvToken>(envTokenSchema)]);
}

export {
  driveAddressMessage,
  switchboardOfDrive,
  type SwitchboardDrive,
} from "./drive-address.js";
