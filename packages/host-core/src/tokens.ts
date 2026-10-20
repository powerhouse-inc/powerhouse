import { z } from "zod";

/**
 * Output tokens (typed-host-configs G3): plain-JSON operators a host file
 * uses to consume values another host's creation produces. An object whose
 * SOLE key is one of TOKEN_KEYS is an operator; `$$` escapes a literal
 * `$`-prefixed sole key. Host-core fields accept them through `tokenable()`
 * (declared form); `resolveHostOutputs` (resolve/) replaces them before a
 * verb runs, and `validateHost` rejects any that remain.
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

/** A collection a `$map` may iterate. */
type MapCollection = readonly unknown[] | Readonly<Record<string, unknown>>;

/** `$map` producing an array of `E` (no `into`). */
export interface ArrayMapToken<E> {
  $map: {
    over: OutputToken<MapCollection> | ItemToken<MapCollection>;
    as?: string;
    to: Template<E>;
    into?: never;
  };
}

/** `$map` producing a record of `V` (`into: "record"`, record `over`). */
export interface RecordMapToken<V> {
  $map: {
    over:
      | OutputToken<Readonly<Record<string, unknown>>>
      | ItemToken<Readonly<Record<string, unknown>>>;
    as?: string;
    to: Template<V>;
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

/**
 * The tokens that may stand where a value of type `T` is expected:
 * `$output`/`$item` whose (branded) value fits `T` (a hand-written literal
 * carries no brand and fits anywhere; the loader checks its path),
 * `$concat`/`$env` where a string fits, `$key` where a string or number
 * fits, and `$map` where `T` is an array (or, `into: "record"`, a record).
 */
export type TokenFor<T> = unknown extends T
  ? Token
  :
      | OutputToken<T>
      | ItemToken<T>
      | (string extends T ? ConcatToken | EnvToken | KeyToken : never)
      | (number extends T ? KeyToken : never)
      | MapTokenFor<T>;

/**
 * A `$map` template for an element of type `T`: `T`'s shape with a fitting
 * token allowed at EVERY position (the rendered element is validated
 * against the field's schema after resolution, so non-ref fields such as a
 * drive `slug` may take `$key`/`$item` here).
 */
export type Template<T> = TokenFor<Untokened<T>> | TemplateShape<Untokened<T>>;

type TemplateShape<T> = T extends readonly unknown[]
  ? Template<T[number]>[]
  : T extends object
    ? { [K in keyof T]: Template<T[K]> }
    : T;

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
  return z.union([schema, token]);
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
  return z.union([schema, token]);
}

/** Like `tokenable`, but the only token accepted is `$env` (e.g.
 * `storage.dataDir`: a path is an environment fact, never another host's
 * output). */
export function envTokenable<S extends z.ZodType>(
  schema: S,
): TokenableSchema<S, EnvToken> {
  return z.union([schema, passthrough<EnvToken>(envTokenSchema)]);
}
