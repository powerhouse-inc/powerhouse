/**
 * Client
 **/

import * as runtime from "./runtime/library.js";
import $Types = runtime.Types; // general types
import $Public = runtime.Types.Public;
import $Utils = runtime.Types.Utils;
import $Extensions = runtime.Types.Extensions;
import $Result = runtime.Types.Result;

export type PrismaPromise<T> = $Public.PrismaPromise<T>;

/**
 * Model Drive
 *
 */
export type Drive = $Result.DefaultSelection<Prisma.$DrivePayload>;
/**
 * Model Document
 *
 */
export type Document = $Result.DefaultSelection<Prisma.$DocumentPayload>;
/**
 * Model DriveDocument
 *
 */
export type DriveDocument =
  $Result.DefaultSelection<Prisma.$DriveDocumentPayload>;
/**
 * Model Operation
 *
 */
export type Operation = $Result.DefaultSelection<Prisma.$OperationPayload>;
/**
 * Model SynchronizationUnit
 *
 */
export type SynchronizationUnit =
  $Result.DefaultSelection<Prisma.$SynchronizationUnitPayload>;
/**
 * Model Attachment
 *
 */
export type Attachment = $Result.DefaultSelection<Prisma.$AttachmentPayload>;

/**
 * ##  Prisma Client ʲˢ
 *
 * Type-safe database client for TypeScript & Node.js
 * @example
 * ```
 * const prisma = new PrismaClient()
 * // Fetch zero or more Drives
 * const drives = await prisma.drive.findMany()
 * ```
 *
 *
 * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client).
 */
export class PrismaClient<
  ClientOptions extends Prisma.PrismaClientOptions = Prisma.PrismaClientOptions,
  U = "log" extends keyof ClientOptions
    ? ClientOptions["log"] extends Array<Prisma.LogLevel | Prisma.LogDefinition>
      ? Prisma.GetEvents<ClientOptions["log"]>
      : never
    : never,
  ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
> {
  [K: symbol]: { types: Prisma.TypeMap<ExtArgs>["other"] };

  /**
   * ##  Prisma Client ʲˢ
   *
   * Type-safe database client for TypeScript & Node.js
   * @example
   * ```
   * const prisma = new PrismaClient()
   * // Fetch zero or more Drives
   * const drives = await prisma.drive.findMany()
   * ```
   *
   *
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client).
   */

  constructor(
    optionsArg?: Prisma.Subset<ClientOptions, Prisma.PrismaClientOptions>,
  );
  $on<V extends U>(
    eventType: V,
    callback: (
      event: V extends "query" ? Prisma.QueryEvent : Prisma.LogEvent,
    ) => void,
  ): void;

  /**
   * Connect with the database
   */
  $connect(): $Utils.JsPromise<void>;

  /**
   * Disconnect from the database
   */
  $disconnect(): $Utils.JsPromise<void>;

  /**
   * Add a middleware
   * @deprecated since 4.16.0. For new code, prefer client extensions instead.
   * @see https://pris.ly/d/extensions
   */
  $use(cb: Prisma.Middleware): void;

  /**
   * Executes a prepared raw query and returns the number of affected rows.
   * @example
   * ```
   * const result = await prisma.$executeRaw`UPDATE User SET cool = ${true} WHERE email = ${'user@email.com'};`
   * ```
   *
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/raw-database-access).
   */
  $executeRaw<T = unknown>(
    query: TemplateStringsArray | Prisma.Sql,
    ...values: any[]
  ): Prisma.PrismaPromise<number>;

  /**
   * Executes a raw query and returns the number of affected rows.
   * Susceptible to SQL injections, see documentation.
   * @example
   * ```
   * const result = await prisma.$executeRawUnsafe('UPDATE User SET cool = $1 WHERE email = $2 ;', true, 'user@email.com')
   * ```
   *
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/raw-database-access).
   */
  $executeRawUnsafe<T = unknown>(
    query: string,
    ...values: any[]
  ): Prisma.PrismaPromise<number>;

  /**
   * Performs a prepared raw query and returns the `SELECT` data.
   * @example
   * ```
   * const result = await prisma.$queryRaw`SELECT * FROM User WHERE id = ${1} OR email = ${'user@email.com'};`
   * ```
   *
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/raw-database-access).
   */
  $queryRaw<T = unknown>(
    query: TemplateStringsArray | Prisma.Sql,
    ...values: any[]
  ): Prisma.PrismaPromise<T>;

  /**
   * Performs a raw query and returns the `SELECT` data.
   * Susceptible to SQL injections, see documentation.
   * @example
   * ```
   * const result = await prisma.$queryRawUnsafe('SELECT * FROM User WHERE id = $1 OR email = $2;', 1, 'user@email.com')
   * ```
   *
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/raw-database-access).
   */
  $queryRawUnsafe<T = unknown>(
    query: string,
    ...values: any[]
  ): Prisma.PrismaPromise<T>;

  /**
   * Allows the running of a sequence of read/write operations that are guaranteed to either succeed or fail as a whole.
   * @example
   * ```
   * const [george, bob, alice] = await prisma.$transaction([
   *   prisma.user.create({ data: { name: 'George' } }),
   *   prisma.user.create({ data: { name: 'Bob' } }),
   *   prisma.user.create({ data: { name: 'Alice' } }),
   * ])
   * ```
   *
   * Read more in our [docs](https://www.prisma.io/docs/concepts/components/prisma-client/transactions).
   */
  $transaction<P extends Prisma.PrismaPromise<any>[]>(
    arg: [...P],
    options?: { isolationLevel?: Prisma.TransactionIsolationLevel },
  ): $Utils.JsPromise<runtime.Types.Utils.UnwrapTuple<P>>;

  $transaction<R>(
    fn: (
      prisma: Omit<PrismaClient, runtime.ITXClientDenyList>,
    ) => $Utils.JsPromise<R>,
    options?: {
      maxWait?: number;
      timeout?: number;
      isolationLevel?: Prisma.TransactionIsolationLevel;
    },
  ): $Utils.JsPromise<R>;

  $extends: $Extensions.ExtendsHook<"extends", Prisma.TypeMapCb, ExtArgs>;

  /**
   * `prisma.drive`: Exposes CRUD operations for the **Drive** model.
   * Example usage:
   * ```ts
   * // Fetch zero or more Drives
   * const drives = await prisma.drive.findMany()
   * ```
   */
  get drive(): Prisma.DriveDelegate<ExtArgs>;

  /**
   * `prisma.document`: Exposes CRUD operations for the **Document** model.
   * Example usage:
   * ```ts
   * // Fetch zero or more Documents
   * const documents = await prisma.document.findMany()
   * ```
   */
  get document(): Prisma.DocumentDelegate<ExtArgs>;

  /**
   * `prisma.driveDocument`: Exposes CRUD operations for the **DriveDocument** model.
   * Example usage:
   * ```ts
   * // Fetch zero or more DriveDocuments
   * const driveDocuments = await prisma.driveDocument.findMany()
   * ```
   */
  get driveDocument(): Prisma.DriveDocumentDelegate<ExtArgs>;

  /**
   * `prisma.operation`: Exposes CRUD operations for the **Operation** model.
   * Example usage:
   * ```ts
   * // Fetch zero or more Operations
   * const operations = await prisma.operation.findMany()
   * ```
   */
  get operation(): Prisma.OperationDelegate<ExtArgs>;

  /**
   * `prisma.synchronizationUnit`: Exposes CRUD operations for the **SynchronizationUnit** model.
   * Example usage:
   * ```ts
   * // Fetch zero or more SynchronizationUnits
   * const synchronizationUnits = await prisma.synchronizationUnit.findMany()
   * ```
   */
  get synchronizationUnit(): Prisma.SynchronizationUnitDelegate<ExtArgs>;

  /**
   * `prisma.attachment`: Exposes CRUD operations for the **Attachment** model.
   * Example usage:
   * ```ts
   * // Fetch zero or more Attachments
   * const attachments = await prisma.attachment.findMany()
   * ```
   */
  get attachment(): Prisma.AttachmentDelegate<ExtArgs>;
}

export namespace Prisma {
  export import DMMF = runtime.DMMF;

  export type PrismaPromise<T> = $Public.PrismaPromise<T>;

  /**
   * Validator
   */
  export import validator = runtime.Public.validator;

  /**
   * Prisma Errors
   */
  export import PrismaClientKnownRequestError = runtime.PrismaClientKnownRequestError;
  export import PrismaClientUnknownRequestError = runtime.PrismaClientUnknownRequestError;
  export import PrismaClientRustPanicError = runtime.PrismaClientRustPanicError;
  export import PrismaClientInitializationError = runtime.PrismaClientInitializationError;
  export import PrismaClientValidationError = runtime.PrismaClientValidationError;
  export import NotFoundError = runtime.NotFoundError;

  /**
   * Re-export of sql-template-tag
   */
  export import sql = runtime.sqltag;
  export import empty = runtime.empty;
  export import join = runtime.join;
  export import raw = runtime.raw;
  export import Sql = runtime.Sql;

  /**
   * Decimal.js
   */
  export import Decimal = runtime.Decimal;

  export type DecimalJsLike = runtime.DecimalJsLike;

  /**
   * Metrics
   */
  export type Metrics = runtime.Metrics;
  export type Metric<T> = runtime.Metric<T>;
  export type MetricHistogram = runtime.MetricHistogram;
  export type MetricHistogramBucket = runtime.MetricHistogramBucket;

  /**
   * Extensions
   */
  export import Extension = $Extensions.UserArgs;
  export import getExtensionContext = runtime.Extensions.getExtensionContext;
  export import Args = $Public.Args;
  export import Payload = $Public.Payload;
  export import Result = $Public.Result;
  export import Exact = $Public.Exact;

  /**
   * Prisma Client JS version: 5.17.0
   * Query Engine version: 393aa359c9ad4a4bb28630fb5613f9c281cde053
   */
  export type PrismaVersion = {
    client: string;
  };

  export const prismaVersion: PrismaVersion;

  /**
   * Utility Types
   */

  /**
   * From https://github.com/sindresorhus/type-fest/
   * Matches a JSON object.
   * This type can be useful to enforce some input to be JSON-compatible or as a super-type to be extended from.
   */
  export type JsonObject = { [Key in string]?: JsonValue };

  /**
   * From https://github.com/sindresorhus/type-fest/
   * Matches a JSON array.
   */
  export interface JsonArray extends Array<JsonValue> {}

  /**
   * From https://github.com/sindresorhus/type-fest/
   * Matches any valid JSON value.
   */
  export type JsonValue =
    | string
    | number
    | boolean
    | JsonObject
    | JsonArray
    | null;

  /**
   * Matches a JSON object.
   * Unlike `JsonObject`, this type allows undefined and read-only properties.
   */
  export type InputJsonObject = {
    readonly [Key in string]?: InputJsonValue | null;
  };

  /**
   * Matches a JSON array.
   * Unlike `JsonArray`, readonly arrays are assignable to this type.
   */
  export interface InputJsonArray
    extends ReadonlyArray<InputJsonValue | null> {}

  /**
   * Matches any valid value that can be used as an input for operations like
   * create and update as the value of a JSON field. Unlike `JsonValue`, this
   * type allows read-only arrays and read-only object properties and disallows
   * `null` at the top level.
   *
   * `null` cannot be used as the value of a JSON field because its meaning
   * would be ambiguous. Use `Prisma.JsonNull` to store the JSON null value or
   * `Prisma.DbNull` to clear the JSON value and set the field to the database
   * NULL value instead.
   *
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-by-null-values
   */
  export type InputJsonValue =
    | string
    | number
    | boolean
    | InputJsonObject
    | InputJsonArray
    | { toJSON(): unknown };

  /**
   * Types of the values used to represent different kinds of `null` values when working with JSON fields.
   *
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  namespace NullTypes {
    /**
     * Type of `Prisma.DbNull`.
     *
     * You cannot use other instances of this class. Please use the `Prisma.DbNull` value.
     *
     * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
     */
    class DbNull {
      private DbNull: never;
      private constructor();
    }

    /**
     * Type of `Prisma.JsonNull`.
     *
     * You cannot use other instances of this class. Please use the `Prisma.JsonNull` value.
     *
     * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
     */
    class JsonNull {
      private JsonNull: never;
      private constructor();
    }

    /**
     * Type of `Prisma.AnyNull`.
     *
     * You cannot use other instances of this class. Please use the `Prisma.AnyNull` value.
     *
     * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
     */
    class AnyNull {
      private AnyNull: never;
      private constructor();
    }
  }

  /**
   * Helper for filtering JSON entries that have `null` on the database (empty on the db)
   *
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  export const DbNull: NullTypes.DbNull;

  /**
   * Helper for filtering JSON entries that have JSON `null` values (not empty on the db)
   *
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  export const JsonNull: NullTypes.JsonNull;

  /**
   * Helper for filtering JSON entries that are `Prisma.DbNull` or `Prisma.JsonNull`
   *
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  export const AnyNull: NullTypes.AnyNull;

  type SelectAndInclude = {
    select: any;
    include: any;
  };

  type SelectAndOmit = {
    select: any;
    omit: any;
  };

  /**
   * Get the type of the value, that the Promise holds.
   */
  export type PromiseType<T extends PromiseLike<any>> =
    T extends PromiseLike<infer U> ? U : T;

  /**
   * Get the return type of a function which returns a Promise.
   */
  export type PromiseReturnType<
    T extends (...args: any) => $Utils.JsPromise<any>,
  > = PromiseType<ReturnType<T>>;

  /**
   * From T, pick a set of properties whose keys are in the union K
   */
  type Prisma__Pick<T, K extends keyof T> = {
    [P in K]: T[P];
  };

  export type Enumerable<T> = T | Array<T>;

  export type RequiredKeys<T> = {
    [K in keyof T]-?: {} extends Prisma__Pick<T, K> ? never : K;
  }[keyof T];

  export type TruthyKeys<T> = keyof {
    [K in keyof T as T[K] extends false | undefined | null ? never : K]: K;
  };

  export type TrueKeys<T> = TruthyKeys<Prisma__Pick<T, RequiredKeys<T>>>;

  /**
   * Subset
   * @desc From `T` pick properties that exist in `U`. Simple version of Intersection
   */
  export type Subset<T, U> = {
    [key in keyof T]: key extends keyof U ? T[key] : never;
  };

  /**
   * SelectSubset
   * @desc From `T` pick properties that exist in `U`. Simple version of Intersection.
   * Additionally, it validates, if both select and include are present. If the case, it errors.
   */
  export type SelectSubset<T, U> = {
    [key in keyof T]: key extends keyof U ? T[key] : never;
  } & (T extends SelectAndInclude
    ? "Please either choose `select` or `include`."
    : T extends SelectAndOmit
      ? "Please either choose `select` or `omit`."
      : {});

  /**
   * Subset + Intersection
   * @desc From `T` pick properties that exist in `U` and intersect `K`
   */
  export type SubsetIntersection<T, U, K> = {
    [key in keyof T]: key extends keyof U ? T[key] : never;
  } & K;

  type Without<T, U> = { [P in Exclude<keyof T, keyof U>]?: never };

  /**
   * XOR is needed to have a real mutually exclusive union type
   * https://stackoverflow.com/questions/42123407/does-typescript-support-mutually-exclusive-types
   */
  type XOR<T, U> = T extends object
    ? U extends object
      ? (Without<T, U> & U) | (Without<U, T> & T)
      : U
    : T;

  /**
   * Is T a Record?
   */
  type IsObject<T extends any> =
    T extends Array<any>
      ? False
      : T extends Date
        ? False
        : T extends Uint8Array
          ? False
          : T extends BigInt
            ? False
            : T extends object
              ? True
              : False;

  /**
   * If it's T[], return T
   */
  export type UnEnumerate<T extends unknown> = T extends Array<infer U> ? U : T;

  /**
   * From ts-toolbelt
   */

  type __Either<O extends object, K extends Key> = Omit<O, K> &
    {
      // Merge all but K
      [P in K]: Prisma__Pick<O, P & keyof O>; // With K possibilities
    }[K];

  type EitherStrict<O extends object, K extends Key> = Strict<__Either<O, K>>;

  type EitherLoose<O extends object, K extends Key> = ComputeRaw<
    __Either<O, K>
  >;

  type _Either<O extends object, K extends Key, strict extends Boolean> = {
    1: EitherStrict<O, K>;
    0: EitherLoose<O, K>;
  }[strict];

  type Either<
    O extends object,
    K extends Key,
    strict extends Boolean = 1,
  > = O extends unknown ? _Either<O, K, strict> : never;

  export type Union = any;

  type PatchUndefined<O extends object, O1 extends object> = {
    [K in keyof O]: O[K] extends undefined ? At<O1, K> : O[K];
  } & {};

  /** Helper Types for "Merge" **/
  export type IntersectOf<U extends Union> = (
    U extends unknown ? (k: U) => void : never
  ) extends (k: infer I) => void
    ? I
    : never;

  export type Overwrite<O extends object, O1 extends object> = {
    [K in keyof O]: K extends keyof O1 ? O1[K] : O[K];
  } & {};

  type _Merge<U extends object> = IntersectOf<
    Overwrite<
      U,
      {
        [K in keyof U]-?: At<U, K>;
      }
    >
  >;

  type Key = string | number | symbol;
  type AtBasic<O extends object, K extends Key> = K extends keyof O
    ? O[K]
    : never;
  type AtStrict<O extends object, K extends Key> = O[K & keyof O];
  type AtLoose<O extends object, K extends Key> = O extends unknown
    ? AtStrict<O, K>
    : never;
  export type At<
    O extends object,
    K extends Key,
    strict extends Boolean = 1,
  > = {
    1: AtStrict<O, K>;
    0: AtLoose<O, K>;
  }[strict];

  export type ComputeRaw<A extends any> = A extends Function
    ? A
    : {
        [K in keyof A]: A[K];
      } & {};

  export type OptionalFlat<O> = {
    [K in keyof O]?: O[K];
  } & {};

  type _Record<K extends keyof any, T> = {
    [P in K]: T;
  };

  // cause typescript not to expand types and preserve names
  type NoExpand<T> = T extends unknown ? T : never;

  // this type assumes the passed object is entirely optional
  type AtLeast<O extends object, K extends string> = NoExpand<
    O extends unknown
      ?
          | (K extends keyof O ? { [P in K]: O[P] } & O : O)
          | ({ [P in keyof O as P extends K ? K : never]-?: O[P] } & O)
      : never
  >;

  type _Strict<U, _U = U> = U extends unknown
    ? U & OptionalFlat<_Record<Exclude<Keys<_U>, keyof U>, never>>
    : never;

  export type Strict<U extends object> = ComputeRaw<_Strict<U>>;
  /** End Helper Types for "Merge" **/

  export type Merge<U extends object> = ComputeRaw<_Merge<Strict<U>>>;

  /**
  A [[Boolean]]
  */
  export type Boolean = True | False;

  // /**
  // 1
  // */
  export type True = 1;

  /**
  0
  */
  export type False = 0;

  export type Not<B extends Boolean> = {
    0: 1;
    1: 0;
  }[B];

  export type Extends<A1 extends any, A2 extends any> = [A1] extends [never]
    ? 0 // anything `never` is false
    : A1 extends A2
      ? 1
      : 0;

  export type Has<U extends Union, U1 extends Union> = Not<
    Extends<Exclude<U1, U>, U1>
  >;

  export type Or<B1 extends Boolean, B2 extends Boolean> = {
    0: {
      0: 0;
      1: 1;
    };
    1: {
      0: 1;
      1: 1;
    };
  }[B1][B2];

  export type Keys<U extends Union> = U extends unknown ? keyof U : never;

  type Cast<A, B> = A extends B ? A : B;

  export const type: unique symbol;

  /**
   * Used by group by
   */

  export type GetScalarType<T, O> = O extends object
    ? {
        [P in keyof T]: P extends keyof O ? O[P] : never;
      }
    : never;

  type FieldPaths<
    T,
    U = Omit<T, "_avg" | "_sum" | "_count" | "_min" | "_max">,
  > = IsObject<T> extends True ? U : T;

  type GetHavingFields<T> = {
    [K in keyof T]: Or<
      Or<Extends<"OR", K>, Extends<"AND", K>>,
      Extends<"NOT", K>
    > extends True
      ? // infer is only needed to not hit TS limit
        // based on the brilliant idea of Pierre-Antoine Mills
        // https://github.com/microsoft/TypeScript/issues/30188#issuecomment-478938437
        T[K] extends infer TK
        ? GetHavingFields<
            UnEnumerate<TK> extends object ? Merge<UnEnumerate<TK>> : never
          >
        : never
      : {} extends FieldPaths<T[K]>
        ? never
        : K;
  }[keyof T];

  /**
   * Convert tuple to union
   */
  type _TupleToUnion<T> = T extends (infer E)[] ? E : never;
  type TupleToUnion<K extends readonly any[]> = _TupleToUnion<K>;
  type MaybeTupleToUnion<T> = T extends any[] ? TupleToUnion<T> : T;

  /**
   * Like `Pick`, but additionally can also accept an array of keys
   */
  type PickEnumerable<
    T,
    K extends Enumerable<keyof T> | keyof T,
  > = Prisma__Pick<T, MaybeTupleToUnion<K>>;

  /**
   * Exclude all keys with underscores
   */
  type ExcludeUnderscoreKeys<T extends string> = T extends `_${string}`
    ? never
    : T;

  export type FieldRef<Model, FieldType> = runtime.FieldRef<Model, FieldType>;

  type FieldRefInputType<Model, FieldType> = Model extends never
    ? never
    : FieldRef<Model, FieldType>;

  export const ModelName: {
    Drive: "Drive";
    Document: "Document";
    DriveDocument: "DriveDocument";
    Operation: "Operation";
    SynchronizationUnit: "SynchronizationUnit";
    Attachment: "Attachment";
  };

  export type ModelName = (typeof ModelName)[keyof typeof ModelName];

  export type Datasources = {
    db?: Datasource;
  };

  interface TypeMapCb
    extends $Utils.Fn<
      { extArgs: $Extensions.InternalArgs; clientOptions: PrismaClientOptions },
      $Utils.Record<string, any>
    > {
    returns: Prisma.TypeMap<
      this["params"]["extArgs"],
      this["params"]["clientOptions"]
    >;
  }

  export type TypeMap<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
    ClientOptions = {},
  > = {
    meta: {
      modelProps:
        | "drive"
        | "document"
        | "driveDocument"
        | "operation"
        | "synchronizationUnit"
        | "attachment";
      txIsolationLevel: Prisma.TransactionIsolationLevel;
    };
    model: {
      Drive: {
        payload: Prisma.$DrivePayload<ExtArgs>;
        fields: Prisma.DriveFieldRefs;
        operations: {
          findUnique: {
            args: Prisma.DriveFindUniqueArgs<ExtArgs>;
            result: $Utils.PayloadToResult<Prisma.$DrivePayload> | null;
          };
          findUniqueOrThrow: {
            args: Prisma.DriveFindUniqueOrThrowArgs<ExtArgs>;
            result: $Utils.PayloadToResult<Prisma.$DrivePayload>;
          };
          findFirst: {
            args: Prisma.DriveFindFirstArgs<ExtArgs>;
            result: $Utils.PayloadToResult<Prisma.$DrivePayload> | null;
          };
          findFirstOrThrow: {
            args: Prisma.DriveFindFirstOrThrowArgs<ExtArgs>;
            result: $Utils.PayloadToResult<Prisma.$DrivePayload>;
          };
          findMany: {
            args: Prisma.DriveFindManyArgs<ExtArgs>;
            result: $Utils.PayloadToResult<Prisma.$DrivePayload>[];
          };
          create: {
            args: Prisma.DriveCreateArgs<ExtArgs>;
            result: $Utils.PayloadToResult<Prisma.$DrivePayload>;
          };
          createMany: {
            args: Prisma.DriveCreateManyArgs<ExtArgs>;
            result: BatchPayload;
          };
          createManyAndReturn: {
            args: Prisma.DriveCreateManyAndReturnArgs<ExtArgs>;
            result: $Utils.PayloadToResult<Prisma.$DrivePayload>[];
          };
          delete: {
            args: Prisma.DriveDeleteArgs<ExtArgs>;
            result: $Utils.PayloadToResult<Prisma.$DrivePayload>;
          };
          update: {
            args: Prisma.DriveUpdateArgs<ExtArgs>;
            result: $Utils.PayloadToResult<Prisma.$DrivePayload>;
          };
          deleteMany: {
            args: Prisma.DriveDeleteManyArgs<ExtArgs>;
            result: BatchPayload;
          };
          updateMany: {
            args: Prisma.DriveUpdateManyArgs<ExtArgs>;
            result: BatchPayload;
          };
          upsert: {
            args: Prisma.DriveUpsertArgs<ExtArgs>;
            result: $Utils.PayloadToResult<Prisma.$DrivePayload>;
          };
          aggregate: {
            args: Prisma.DriveAggregateArgs<ExtArgs>;
            result: $Utils.Optional<AggregateDrive>;
          };
          groupBy: {
            args: Prisma.DriveGroupByArgs<ExtArgs>;
            result: $Utils.Optional<DriveGroupByOutputType>[];
          };
          count: {
            args: Prisma.DriveCountArgs<ExtArgs>;
            result: $Utils.Optional<DriveCountAggregateOutputType> | number;
          };
        };
      };
      Document: {
        payload: Prisma.$DocumentPayload<ExtArgs>;
        fields: Prisma.DocumentFieldRefs;
        operations: {
          findUnique: {
            args: Prisma.DocumentFindUniqueArgs<ExtArgs>;
            result: $Utils.PayloadToResult<Prisma.$DocumentPayload> | null;
          };
          findUniqueOrThrow: {
            args: Prisma.DocumentFindUniqueOrThrowArgs<ExtArgs>;
            result: $Utils.PayloadToResult<Prisma.$DocumentPayload>;
          };
          findFirst: {
            args: Prisma.DocumentFindFirstArgs<ExtArgs>;
            result: $Utils.PayloadToResult<Prisma.$DocumentPayload> | null;
          };
          findFirstOrThrow: {
            args: Prisma.DocumentFindFirstOrThrowArgs<ExtArgs>;
            result: $Utils.PayloadToResult<Prisma.$DocumentPayload>;
          };
          findMany: {
            args: Prisma.DocumentFindManyArgs<ExtArgs>;
            result: $Utils.PayloadToResult<Prisma.$DocumentPayload>[];
          };
          create: {
            args: Prisma.DocumentCreateArgs<ExtArgs>;
            result: $Utils.PayloadToResult<Prisma.$DocumentPayload>;
          };
          createMany: {
            args: Prisma.DocumentCreateManyArgs<ExtArgs>;
            result: BatchPayload;
          };
          createManyAndReturn: {
            args: Prisma.DocumentCreateManyAndReturnArgs<ExtArgs>;
            result: $Utils.PayloadToResult<Prisma.$DocumentPayload>[];
          };
          delete: {
            args: Prisma.DocumentDeleteArgs<ExtArgs>;
            result: $Utils.PayloadToResult<Prisma.$DocumentPayload>;
          };
          update: {
            args: Prisma.DocumentUpdateArgs<ExtArgs>;
            result: $Utils.PayloadToResult<Prisma.$DocumentPayload>;
          };
          deleteMany: {
            args: Prisma.DocumentDeleteManyArgs<ExtArgs>;
            result: BatchPayload;
          };
          updateMany: {
            args: Prisma.DocumentUpdateManyArgs<ExtArgs>;
            result: BatchPayload;
          };
          upsert: {
            args: Prisma.DocumentUpsertArgs<ExtArgs>;
            result: $Utils.PayloadToResult<Prisma.$DocumentPayload>;
          };
          aggregate: {
            args: Prisma.DocumentAggregateArgs<ExtArgs>;
            result: $Utils.Optional<AggregateDocument>;
          };
          groupBy: {
            args: Prisma.DocumentGroupByArgs<ExtArgs>;
            result: $Utils.Optional<DocumentGroupByOutputType>[];
          };
          count: {
            args: Prisma.DocumentCountArgs<ExtArgs>;
            result: $Utils.Optional<DocumentCountAggregateOutputType> | number;
          };
        };
      };
      DriveDocument: {
        payload: Prisma.$DriveDocumentPayload<ExtArgs>;
        fields: Prisma.DriveDocumentFieldRefs;
        operations: {
          findUnique: {
            args: Prisma.DriveDocumentFindUniqueArgs<ExtArgs>;
            result: $Utils.PayloadToResult<Prisma.$DriveDocumentPayload> | null;
          };
          findUniqueOrThrow: {
            args: Prisma.DriveDocumentFindUniqueOrThrowArgs<ExtArgs>;
            result: $Utils.PayloadToResult<Prisma.$DriveDocumentPayload>;
          };
          findFirst: {
            args: Prisma.DriveDocumentFindFirstArgs<ExtArgs>;
            result: $Utils.PayloadToResult<Prisma.$DriveDocumentPayload> | null;
          };
          findFirstOrThrow: {
            args: Prisma.DriveDocumentFindFirstOrThrowArgs<ExtArgs>;
            result: $Utils.PayloadToResult<Prisma.$DriveDocumentPayload>;
          };
          findMany: {
            args: Prisma.DriveDocumentFindManyArgs<ExtArgs>;
            result: $Utils.PayloadToResult<Prisma.$DriveDocumentPayload>[];
          };
          create: {
            args: Prisma.DriveDocumentCreateArgs<ExtArgs>;
            result: $Utils.PayloadToResult<Prisma.$DriveDocumentPayload>;
          };
          createMany: {
            args: Prisma.DriveDocumentCreateManyArgs<ExtArgs>;
            result: BatchPayload;
          };
          createManyAndReturn: {
            args: Prisma.DriveDocumentCreateManyAndReturnArgs<ExtArgs>;
            result: $Utils.PayloadToResult<Prisma.$DriveDocumentPayload>[];
          };
          delete: {
            args: Prisma.DriveDocumentDeleteArgs<ExtArgs>;
            result: $Utils.PayloadToResult<Prisma.$DriveDocumentPayload>;
          };
          update: {
            args: Prisma.DriveDocumentUpdateArgs<ExtArgs>;
            result: $Utils.PayloadToResult<Prisma.$DriveDocumentPayload>;
          };
          deleteMany: {
            args: Prisma.DriveDocumentDeleteManyArgs<ExtArgs>;
            result: BatchPayload;
          };
          updateMany: {
            args: Prisma.DriveDocumentUpdateManyArgs<ExtArgs>;
            result: BatchPayload;
          };
          upsert: {
            args: Prisma.DriveDocumentUpsertArgs<ExtArgs>;
            result: $Utils.PayloadToResult<Prisma.$DriveDocumentPayload>;
          };
          aggregate: {
            args: Prisma.DriveDocumentAggregateArgs<ExtArgs>;
            result: $Utils.Optional<AggregateDriveDocument>;
          };
          groupBy: {
            args: Prisma.DriveDocumentGroupByArgs<ExtArgs>;
            result: $Utils.Optional<DriveDocumentGroupByOutputType>[];
          };
          count: {
            args: Prisma.DriveDocumentCountArgs<ExtArgs>;
            result:
              | $Utils.Optional<DriveDocumentCountAggregateOutputType>
              | number;
          };
        };
      };
      Operation: {
        payload: Prisma.$OperationPayload<ExtArgs>;
        fields: Prisma.OperationFieldRefs;
        operations: {
          findUnique: {
            args: Prisma.OperationFindUniqueArgs<ExtArgs>;
            result: $Utils.PayloadToResult<Prisma.$OperationPayload> | null;
          };
          findUniqueOrThrow: {
            args: Prisma.OperationFindUniqueOrThrowArgs<ExtArgs>;
            result: $Utils.PayloadToResult<Prisma.$OperationPayload>;
          };
          findFirst: {
            args: Prisma.OperationFindFirstArgs<ExtArgs>;
            result: $Utils.PayloadToResult<Prisma.$OperationPayload> | null;
          };
          findFirstOrThrow: {
            args: Prisma.OperationFindFirstOrThrowArgs<ExtArgs>;
            result: $Utils.PayloadToResult<Prisma.$OperationPayload>;
          };
          findMany: {
            args: Prisma.OperationFindManyArgs<ExtArgs>;
            result: $Utils.PayloadToResult<Prisma.$OperationPayload>[];
          };
          create: {
            args: Prisma.OperationCreateArgs<ExtArgs>;
            result: $Utils.PayloadToResult<Prisma.$OperationPayload>;
          };
          createMany: {
            args: Prisma.OperationCreateManyArgs<ExtArgs>;
            result: BatchPayload;
          };
          createManyAndReturn: {
            args: Prisma.OperationCreateManyAndReturnArgs<ExtArgs>;
            result: $Utils.PayloadToResult<Prisma.$OperationPayload>[];
          };
          delete: {
            args: Prisma.OperationDeleteArgs<ExtArgs>;
            result: $Utils.PayloadToResult<Prisma.$OperationPayload>;
          };
          update: {
            args: Prisma.OperationUpdateArgs<ExtArgs>;
            result: $Utils.PayloadToResult<Prisma.$OperationPayload>;
          };
          deleteMany: {
            args: Prisma.OperationDeleteManyArgs<ExtArgs>;
            result: BatchPayload;
          };
          updateMany: {
            args: Prisma.OperationUpdateManyArgs<ExtArgs>;
            result: BatchPayload;
          };
          upsert: {
            args: Prisma.OperationUpsertArgs<ExtArgs>;
            result: $Utils.PayloadToResult<Prisma.$OperationPayload>;
          };
          aggregate: {
            args: Prisma.OperationAggregateArgs<ExtArgs>;
            result: $Utils.Optional<AggregateOperation>;
          };
          groupBy: {
            args: Prisma.OperationGroupByArgs<ExtArgs>;
            result: $Utils.Optional<OperationGroupByOutputType>[];
          };
          count: {
            args: Prisma.OperationCountArgs<ExtArgs>;
            result: $Utils.Optional<OperationCountAggregateOutputType> | number;
          };
        };
      };
      SynchronizationUnit: {
        payload: Prisma.$SynchronizationUnitPayload<ExtArgs>;
        fields: Prisma.SynchronizationUnitFieldRefs;
        operations: {
          findUnique: {
            args: Prisma.SynchronizationUnitFindUniqueArgs<ExtArgs>;
            result: $Utils.PayloadToResult<Prisma.$SynchronizationUnitPayload> | null;
          };
          findUniqueOrThrow: {
            args: Prisma.SynchronizationUnitFindUniqueOrThrowArgs<ExtArgs>;
            result: $Utils.PayloadToResult<Prisma.$SynchronizationUnitPayload>;
          };
          findFirst: {
            args: Prisma.SynchronizationUnitFindFirstArgs<ExtArgs>;
            result: $Utils.PayloadToResult<Prisma.$SynchronizationUnitPayload> | null;
          };
          findFirstOrThrow: {
            args: Prisma.SynchronizationUnitFindFirstOrThrowArgs<ExtArgs>;
            result: $Utils.PayloadToResult<Prisma.$SynchronizationUnitPayload>;
          };
          findMany: {
            args: Prisma.SynchronizationUnitFindManyArgs<ExtArgs>;
            result: $Utils.PayloadToResult<Prisma.$SynchronizationUnitPayload>[];
          };
          create: {
            args: Prisma.SynchronizationUnitCreateArgs<ExtArgs>;
            result: $Utils.PayloadToResult<Prisma.$SynchronizationUnitPayload>;
          };
          createMany: {
            args: Prisma.SynchronizationUnitCreateManyArgs<ExtArgs>;
            result: BatchPayload;
          };
          createManyAndReturn: {
            args: Prisma.SynchronizationUnitCreateManyAndReturnArgs<ExtArgs>;
            result: $Utils.PayloadToResult<Prisma.$SynchronizationUnitPayload>[];
          };
          delete: {
            args: Prisma.SynchronizationUnitDeleteArgs<ExtArgs>;
            result: $Utils.PayloadToResult<Prisma.$SynchronizationUnitPayload>;
          };
          update: {
            args: Prisma.SynchronizationUnitUpdateArgs<ExtArgs>;
            result: $Utils.PayloadToResult<Prisma.$SynchronizationUnitPayload>;
          };
          deleteMany: {
            args: Prisma.SynchronizationUnitDeleteManyArgs<ExtArgs>;
            result: BatchPayload;
          };
          updateMany: {
            args: Prisma.SynchronizationUnitUpdateManyArgs<ExtArgs>;
            result: BatchPayload;
          };
          upsert: {
            args: Prisma.SynchronizationUnitUpsertArgs<ExtArgs>;
            result: $Utils.PayloadToResult<Prisma.$SynchronizationUnitPayload>;
          };
          aggregate: {
            args: Prisma.SynchronizationUnitAggregateArgs<ExtArgs>;
            result: $Utils.Optional<AggregateSynchronizationUnit>;
          };
          groupBy: {
            args: Prisma.SynchronizationUnitGroupByArgs<ExtArgs>;
            result: $Utils.Optional<SynchronizationUnitGroupByOutputType>[];
          };
          count: {
            args: Prisma.SynchronizationUnitCountArgs<ExtArgs>;
            result:
              | $Utils.Optional<SynchronizationUnitCountAggregateOutputType>
              | number;
          };
        };
      };
      Attachment: {
        payload: Prisma.$AttachmentPayload<ExtArgs>;
        fields: Prisma.AttachmentFieldRefs;
        operations: {
          findUnique: {
            args: Prisma.AttachmentFindUniqueArgs<ExtArgs>;
            result: $Utils.PayloadToResult<Prisma.$AttachmentPayload> | null;
          };
          findUniqueOrThrow: {
            args: Prisma.AttachmentFindUniqueOrThrowArgs<ExtArgs>;
            result: $Utils.PayloadToResult<Prisma.$AttachmentPayload>;
          };
          findFirst: {
            args: Prisma.AttachmentFindFirstArgs<ExtArgs>;
            result: $Utils.PayloadToResult<Prisma.$AttachmentPayload> | null;
          };
          findFirstOrThrow: {
            args: Prisma.AttachmentFindFirstOrThrowArgs<ExtArgs>;
            result: $Utils.PayloadToResult<Prisma.$AttachmentPayload>;
          };
          findMany: {
            args: Prisma.AttachmentFindManyArgs<ExtArgs>;
            result: $Utils.PayloadToResult<Prisma.$AttachmentPayload>[];
          };
          create: {
            args: Prisma.AttachmentCreateArgs<ExtArgs>;
            result: $Utils.PayloadToResult<Prisma.$AttachmentPayload>;
          };
          createMany: {
            args: Prisma.AttachmentCreateManyArgs<ExtArgs>;
            result: BatchPayload;
          };
          createManyAndReturn: {
            args: Prisma.AttachmentCreateManyAndReturnArgs<ExtArgs>;
            result: $Utils.PayloadToResult<Prisma.$AttachmentPayload>[];
          };
          delete: {
            args: Prisma.AttachmentDeleteArgs<ExtArgs>;
            result: $Utils.PayloadToResult<Prisma.$AttachmentPayload>;
          };
          update: {
            args: Prisma.AttachmentUpdateArgs<ExtArgs>;
            result: $Utils.PayloadToResult<Prisma.$AttachmentPayload>;
          };
          deleteMany: {
            args: Prisma.AttachmentDeleteManyArgs<ExtArgs>;
            result: BatchPayload;
          };
          updateMany: {
            args: Prisma.AttachmentUpdateManyArgs<ExtArgs>;
            result: BatchPayload;
          };
          upsert: {
            args: Prisma.AttachmentUpsertArgs<ExtArgs>;
            result: $Utils.PayloadToResult<Prisma.$AttachmentPayload>;
          };
          aggregate: {
            args: Prisma.AttachmentAggregateArgs<ExtArgs>;
            result: $Utils.Optional<AggregateAttachment>;
          };
          groupBy: {
            args: Prisma.AttachmentGroupByArgs<ExtArgs>;
            result: $Utils.Optional<AttachmentGroupByOutputType>[];
          };
          count: {
            args: Prisma.AttachmentCountArgs<ExtArgs>;
            result:
              | $Utils.Optional<AttachmentCountAggregateOutputType>
              | number;
          };
        };
      };
    };
  } & {
    other: {
      payload: any;
      operations: {
        $executeRawUnsafe: {
          args: [query: string, ...values: any[]];
          result: any;
        };
        $executeRaw: {
          args: [query: TemplateStringsArray | Prisma.Sql, ...values: any[]];
          result: any;
        };
        $queryRawUnsafe: {
          args: [query: string, ...values: any[]];
          result: any;
        };
        $queryRaw: {
          args: [query: TemplateStringsArray | Prisma.Sql, ...values: any[]];
          result: any;
        };
      };
    };
  };
  export const defineExtension: $Extensions.ExtendsHook<
    "define",
    Prisma.TypeMapCb,
    $Extensions.DefaultArgs
  >;
  export type DefaultPrismaClient = PrismaClient;
  export type ErrorFormat = "pretty" | "colorless" | "minimal";
  export interface PrismaClientOptions {
    /**
     * Overwrites the datasource url from your schema.prisma file
     */
    datasources?: Datasources;
    /**
     * Overwrites the datasource url from your schema.prisma file
     */
    datasourceUrl?: string;
    /**
     * @default "colorless"
     */
    errorFormat?: ErrorFormat;
    /**
     * @example
     * ```
     * // Defaults to stdout
     * log: ['query', 'info', 'warn', 'error']
     *
     * // Emit as events
     * log: [
     *   { emit: 'stdout', level: 'query' },
     *   { emit: 'stdout', level: 'info' },
     *   { emit: 'stdout', level: 'warn' }
     *   { emit: 'stdout', level: 'error' }
     * ]
     * ```
     * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/logging#the-log-option).
     */
    log?: (LogLevel | LogDefinition)[];
    /**
     * The default values for transactionOptions
     * maxWait ?= 2000
     * timeout ?= 5000
     */
    transactionOptions?: {
      maxWait?: number;
      timeout?: number;
      isolationLevel?: Prisma.TransactionIsolationLevel;
    };
  }

  /* Types for Logging */
  export type LogLevel = "info" | "query" | "warn" | "error";
  export type LogDefinition = {
    level: LogLevel;
    emit: "stdout" | "event";
  };

  export type GetLogType<T extends LogLevel | LogDefinition> =
    T extends LogDefinition
      ? T["emit"] extends "event"
        ? T["level"]
        : never
      : never;
  export type GetEvents<T extends any> =
    T extends Array<LogLevel | LogDefinition>
      ?
          | GetLogType<T[0]>
          | GetLogType<T[1]>
          | GetLogType<T[2]>
          | GetLogType<T[3]>
      : never;

  export type QueryEvent = {
    timestamp: Date;
    query: string;
    params: string;
    duration: number;
    target: string;
  };

  export type LogEvent = {
    timestamp: Date;
    message: string;
    target: string;
  };
  /* End Types for Logging */

  export type PrismaAction =
    | "findUnique"
    | "findUniqueOrThrow"
    | "findMany"
    | "findFirst"
    | "findFirstOrThrow"
    | "create"
    | "createMany"
    | "createManyAndReturn"
    | "update"
    | "updateMany"
    | "upsert"
    | "delete"
    | "deleteMany"
    | "executeRaw"
    | "queryRaw"
    | "aggregate"
    | "count"
    | "runCommandRaw"
    | "findRaw"
    | "groupBy";

  /**
   * These options are being passed into the middleware as "params"
   */
  export type MiddlewareParams = {
    model?: ModelName;
    action: PrismaAction;
    args: any;
    dataPath: string[];
    runInTransaction: boolean;
  };

  /**
   * The `T` type makes sure, that the `return proceed` is not forgotten in the middleware implementation
   */
  export type Middleware<T = any> = (
    params: MiddlewareParams,
    next: (params: MiddlewareParams) => $Utils.JsPromise<T>,
  ) => $Utils.JsPromise<T>;

  // tested in getLogLevel.test.ts
  export function getLogLevel(
    log: Array<LogLevel | LogDefinition>,
  ): LogLevel | undefined;

  /**
   * `PrismaClient` proxy available in interactive transactions.
   */
  export type TransactionClient = Omit<
    Prisma.DefaultPrismaClient,
    runtime.ITXClientDenyList
  >;

  export type Datasource = {
    url?: string;
  };

  /**
   * Count Types
   */

  /**
   * Count Type DriveCountOutputType
   */

  export type DriveCountOutputType = {
    driveDocuments: number;
  };

  export type DriveCountOutputTypeSelect<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    driveDocuments?: boolean | DriveCountOutputTypeCountDriveDocumentsArgs;
  };

  // Custom InputTypes
  /**
   * DriveCountOutputType without action
   */
  export type DriveCountOutputTypeDefaultArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * Select specific fields to fetch from the DriveCountOutputType
     */
    select?: DriveCountOutputTypeSelect<ExtArgs> | null;
  };

  /**
   * DriveCountOutputType without action
   */
  export type DriveCountOutputTypeCountDriveDocumentsArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    where?: DriveDocumentWhereInput;
  };

  /**
   * Count Type DocumentCountOutputType
   */

  export type DocumentCountOutputType = {
    operations: number;
    synchronizationUnits: number;
  };

  export type DocumentCountOutputTypeSelect<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    operations?: boolean | DocumentCountOutputTypeCountOperationsArgs;
    synchronizationUnits?:
      | boolean
      | DocumentCountOutputTypeCountSynchronizationUnitsArgs;
  };

  // Custom InputTypes
  /**
   * DocumentCountOutputType without action
   */
  export type DocumentCountOutputTypeDefaultArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * Select specific fields to fetch from the DocumentCountOutputType
     */
    select?: DocumentCountOutputTypeSelect<ExtArgs> | null;
  };

  /**
   * DocumentCountOutputType without action
   */
  export type DocumentCountOutputTypeCountOperationsArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    where?: OperationWhereInput;
  };

  /**
   * DocumentCountOutputType without action
   */
  export type DocumentCountOutputTypeCountSynchronizationUnitsArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    where?: SynchronizationUnitWhereInput;
  };

  /**
   * Count Type OperationCountOutputType
   */

  export type OperationCountOutputType = {
    attachments: number;
  };

  export type OperationCountOutputTypeSelect<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    attachments?: boolean | OperationCountOutputTypeCountAttachmentsArgs;
  };

  // Custom InputTypes
  /**
   * OperationCountOutputType without action
   */
  export type OperationCountOutputTypeDefaultArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * Select specific fields to fetch from the OperationCountOutputType
     */
    select?: OperationCountOutputTypeSelect<ExtArgs> | null;
  };

  /**
   * OperationCountOutputType without action
   */
  export type OperationCountOutputTypeCountAttachmentsArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    where?: AttachmentWhereInput;
  };

  /**
   * Count Type SynchronizationUnitCountOutputType
   */

  export type SynchronizationUnitCountOutputType = {
    operations: number;
  };

  export type SynchronizationUnitCountOutputTypeSelect<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    operations?:
      | boolean
      | SynchronizationUnitCountOutputTypeCountOperationsArgs;
  };

  // Custom InputTypes
  /**
   * SynchronizationUnitCountOutputType without action
   */
  export type SynchronizationUnitCountOutputTypeDefaultArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * Select specific fields to fetch from the SynchronizationUnitCountOutputType
     */
    select?: SynchronizationUnitCountOutputTypeSelect<ExtArgs> | null;
  };

  /**
   * SynchronizationUnitCountOutputType without action
   */
  export type SynchronizationUnitCountOutputTypeCountOperationsArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    where?: OperationWhereInput;
  };

  /**
   * Models
   */

  /**
   * Model Drive
   */

  export type AggregateDrive = {
    _count: DriveCountAggregateOutputType | null;
    _min: DriveMinAggregateOutputType | null;
    _max: DriveMaxAggregateOutputType | null;
  };

  export type DriveMinAggregateOutputType = {
    id: string | null;
  };

  export type DriveMaxAggregateOutputType = {
    id: string | null;
  };

  export type DriveCountAggregateOutputType = {
    id: number;
    _all: number;
  };

  export type DriveMinAggregateInputType = {
    id?: true;
  };

  export type DriveMaxAggregateInputType = {
    id?: true;
  };

  export type DriveCountAggregateInputType = {
    id?: true;
    _all?: true;
  };

  export type DriveAggregateArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * Filter which Drive to aggregate.
     */
    where?: DriveWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of Drives to fetch.
     */
    orderBy?: DriveOrderByWithRelationInput | DriveOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the start position
     */
    cursor?: DriveWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` Drives from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` Drives.
     */
    skip?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Count returned Drives
     **/
    _count?: true | DriveCountAggregateInputType;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Select which fields to find the minimum value
     **/
    _min?: DriveMinAggregateInputType;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Select which fields to find the maximum value
     **/
    _max?: DriveMaxAggregateInputType;
  };

  export type GetDriveAggregateType<T extends DriveAggregateArgs> = {
    [P in keyof T & keyof AggregateDrive]: P extends "_count" | "count"
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateDrive[P]>
      : GetScalarType<T[P], AggregateDrive[P]>;
  };

  export type DriveGroupByArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    where?: DriveWhereInput;
    orderBy?:
      | DriveOrderByWithAggregationInput
      | DriveOrderByWithAggregationInput[];
    by: DriveScalarFieldEnum[] | DriveScalarFieldEnum;
    having?: DriveScalarWhereWithAggregatesInput;
    take?: number;
    skip?: number;
    _count?: DriveCountAggregateInputType | true;
    _min?: DriveMinAggregateInputType;
    _max?: DriveMaxAggregateInputType;
  };

  export type DriveGroupByOutputType = {
    id: string;
    _count: DriveCountAggregateOutputType | null;
    _min: DriveMinAggregateOutputType | null;
    _max: DriveMaxAggregateOutputType | null;
  };

  type GetDriveGroupByPayload<T extends DriveGroupByArgs> =
    Prisma.PrismaPromise<
      Array<
        PickEnumerable<DriveGroupByOutputType, T["by"]> & {
          [P in keyof T & keyof DriveGroupByOutputType]: P extends "_count"
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], DriveGroupByOutputType[P]>
            : GetScalarType<T[P], DriveGroupByOutputType[P]>;
        }
      >
    >;

  export type DriveSelect<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = $Extensions.GetSelect<
    {
      id?: boolean;
      driveDocuments?: boolean | Drive$driveDocumentsArgs<ExtArgs>;
      _count?: boolean | DriveCountOutputTypeDefaultArgs<ExtArgs>;
    },
    ExtArgs["result"]["drive"]
  >;

  export type DriveSelectCreateManyAndReturn<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = $Extensions.GetSelect<
    {
      id?: boolean;
    },
    ExtArgs["result"]["drive"]
  >;

  export type DriveSelectScalar = {
    id?: boolean;
  };

  export type DriveInclude<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    driveDocuments?: boolean | Drive$driveDocumentsArgs<ExtArgs>;
    _count?: boolean | DriveCountOutputTypeDefaultArgs<ExtArgs>;
  };
  export type DriveIncludeCreateManyAndReturn<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {};

  export type $DrivePayload<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    name: "Drive";
    objects: {
      driveDocuments: Prisma.$DriveDocumentPayload<ExtArgs>[];
    };
    scalars: $Extensions.GetPayloadResult<
      {
        id: string;
      },
      ExtArgs["result"]["drive"]
    >;
    composites: {};
  };

  type DriveGetPayload<
    S extends boolean | null | undefined | DriveDefaultArgs,
  > = $Result.GetResult<Prisma.$DrivePayload, S>;

  type DriveCountArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = Omit<DriveFindManyArgs, "select" | "include" | "distinct"> & {
    select?: DriveCountAggregateInputType | true;
  };

  export interface DriveDelegate<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > {
    [K: symbol]: {
      types: Prisma.TypeMap<ExtArgs>["model"]["Drive"];
      meta: { name: "Drive" };
    };
    /**
     * Find zero or one Drive that matches the filter.
     * @param {DriveFindUniqueArgs} args - Arguments to find a Drive
     * @example
     * // Get one Drive
     * const drive = await prisma.drive.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends DriveFindUniqueArgs>(
      args: SelectSubset<T, DriveFindUniqueArgs<ExtArgs>>,
    ): Prisma__DriveClient<
      $Result.GetResult<Prisma.$DrivePayload<ExtArgs>, T, "findUnique"> | null,
      null,
      ExtArgs
    >;

    /**
     * Find one Drive that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {DriveFindUniqueOrThrowArgs} args - Arguments to find a Drive
     * @example
     * // Get one Drive
     * const drive = await prisma.drive.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends DriveFindUniqueOrThrowArgs>(
      args: SelectSubset<T, DriveFindUniqueOrThrowArgs<ExtArgs>>,
    ): Prisma__DriveClient<
      $Result.GetResult<Prisma.$DrivePayload<ExtArgs>, T, "findUniqueOrThrow">,
      never,
      ExtArgs
    >;

    /**
     * Find the first Drive that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {DriveFindFirstArgs} args - Arguments to find a Drive
     * @example
     * // Get one Drive
     * const drive = await prisma.drive.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends DriveFindFirstArgs>(
      args?: SelectSubset<T, DriveFindFirstArgs<ExtArgs>>,
    ): Prisma__DriveClient<
      $Result.GetResult<Prisma.$DrivePayload<ExtArgs>, T, "findFirst"> | null,
      null,
      ExtArgs
    >;

    /**
     * Find the first Drive that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {DriveFindFirstOrThrowArgs} args - Arguments to find a Drive
     * @example
     * // Get one Drive
     * const drive = await prisma.drive.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends DriveFindFirstOrThrowArgs>(
      args?: SelectSubset<T, DriveFindFirstOrThrowArgs<ExtArgs>>,
    ): Prisma__DriveClient<
      $Result.GetResult<Prisma.$DrivePayload<ExtArgs>, T, "findFirstOrThrow">,
      never,
      ExtArgs
    >;

    /**
     * Find zero or more Drives that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {DriveFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all Drives
     * const drives = await prisma.drive.findMany()
     *
     * // Get first 10 Drives
     * const drives = await prisma.drive.findMany({ take: 10 })
     *
     * // Only select the `id`
     * const driveWithIdOnly = await prisma.drive.findMany({ select: { id: true } })
     *
     */
    findMany<T extends DriveFindManyArgs>(
      args?: SelectSubset<T, DriveFindManyArgs<ExtArgs>>,
    ): Prisma.PrismaPromise<
      $Result.GetResult<Prisma.$DrivePayload<ExtArgs>, T, "findMany">
    >;

    /**
     * Create a Drive.
     * @param {DriveCreateArgs} args - Arguments to create a Drive.
     * @example
     * // Create one Drive
     * const Drive = await prisma.drive.create({
     *   data: {
     *     // ... data to create a Drive
     *   }
     * })
     *
     */
    create<T extends DriveCreateArgs>(
      args: SelectSubset<T, DriveCreateArgs<ExtArgs>>,
    ): Prisma__DriveClient<
      $Result.GetResult<Prisma.$DrivePayload<ExtArgs>, T, "create">,
      never,
      ExtArgs
    >;

    /**
     * Create many Drives.
     * @param {DriveCreateManyArgs} args - Arguments to create many Drives.
     * @example
     * // Create many Drives
     * const drive = await prisma.drive.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *
     */
    createMany<T extends DriveCreateManyArgs>(
      args?: SelectSubset<T, DriveCreateManyArgs<ExtArgs>>,
    ): Prisma.PrismaPromise<BatchPayload>;

    /**
     * Create many Drives and returns the data saved in the database.
     * @param {DriveCreateManyAndReturnArgs} args - Arguments to create many Drives.
     * @example
     * // Create many Drives
     * const drive = await prisma.drive.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *
     * // Create many Drives and only return the `id`
     * const driveWithIdOnly = await prisma.drive.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     *
     */
    createManyAndReturn<T extends DriveCreateManyAndReturnArgs>(
      args?: SelectSubset<T, DriveCreateManyAndReturnArgs<ExtArgs>>,
    ): Prisma.PrismaPromise<
      $Result.GetResult<Prisma.$DrivePayload<ExtArgs>, T, "createManyAndReturn">
    >;

    /**
     * Delete a Drive.
     * @param {DriveDeleteArgs} args - Arguments to delete one Drive.
     * @example
     * // Delete one Drive
     * const Drive = await prisma.drive.delete({
     *   where: {
     *     // ... filter to delete one Drive
     *   }
     * })
     *
     */
    delete<T extends DriveDeleteArgs>(
      args: SelectSubset<T, DriveDeleteArgs<ExtArgs>>,
    ): Prisma__DriveClient<
      $Result.GetResult<Prisma.$DrivePayload<ExtArgs>, T, "delete">,
      never,
      ExtArgs
    >;

    /**
     * Update one Drive.
     * @param {DriveUpdateArgs} args - Arguments to update one Drive.
     * @example
     * // Update one Drive
     * const drive = await prisma.drive.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     *
     */
    update<T extends DriveUpdateArgs>(
      args: SelectSubset<T, DriveUpdateArgs<ExtArgs>>,
    ): Prisma__DriveClient<
      $Result.GetResult<Prisma.$DrivePayload<ExtArgs>, T, "update">,
      never,
      ExtArgs
    >;

    /**
     * Delete zero or more Drives.
     * @param {DriveDeleteManyArgs} args - Arguments to filter Drives to delete.
     * @example
     * // Delete a few Drives
     * const { count } = await prisma.drive.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     *
     */
    deleteMany<T extends DriveDeleteManyArgs>(
      args?: SelectSubset<T, DriveDeleteManyArgs<ExtArgs>>,
    ): Prisma.PrismaPromise<BatchPayload>;

    /**
     * Update zero or more Drives.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {DriveUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many Drives
     * const drive = await prisma.drive.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     *
     */
    updateMany<T extends DriveUpdateManyArgs>(
      args: SelectSubset<T, DriveUpdateManyArgs<ExtArgs>>,
    ): Prisma.PrismaPromise<BatchPayload>;

    /**
     * Create or update one Drive.
     * @param {DriveUpsertArgs} args - Arguments to update or create a Drive.
     * @example
     * // Update or create a Drive
     * const drive = await prisma.drive.upsert({
     *   create: {
     *     // ... data to create a Drive
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the Drive we want to update
     *   }
     * })
     */
    upsert<T extends DriveUpsertArgs>(
      args: SelectSubset<T, DriveUpsertArgs<ExtArgs>>,
    ): Prisma__DriveClient<
      $Result.GetResult<Prisma.$DrivePayload<ExtArgs>, T, "upsert">,
      never,
      ExtArgs
    >;

    /**
     * Count the number of Drives.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {DriveCountArgs} args - Arguments to filter Drives to count.
     * @example
     * // Count the number of Drives
     * const count = await prisma.drive.count({
     *   where: {
     *     // ... the filter for the Drives we want to count
     *   }
     * })
     **/
    count<T extends DriveCountArgs>(
      args?: Subset<T, DriveCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<"select", any>
        ? T["select"] extends true
          ? number
          : GetScalarType<T["select"], DriveCountAggregateOutputType>
        : number
    >;

    /**
     * Allows you to perform aggregations operations on a Drive.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {DriveAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
     **/
    aggregate<T extends DriveAggregateArgs>(
      args: Subset<T, DriveAggregateArgs>,
    ): Prisma.PrismaPromise<GetDriveAggregateType<T>>;

    /**
     * Group by Drive.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {DriveGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     *
     **/
    groupBy<
      T extends DriveGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<"skip", Keys<T>>,
        Extends<"take", Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: DriveGroupByArgs["orderBy"] }
        : { orderBy?: DriveGroupByArgs["orderBy"] },
      OrderFields extends ExcludeUnderscoreKeys<
        Keys<MaybeTupleToUnion<T["orderBy"]>>
      >,
      ByFields extends MaybeTupleToUnion<T["by"]>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T["having"]>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T["by"] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
        ? `Error: "by" must not be empty.`
        : HavingValid extends False
          ? {
              [P in HavingFields]: P extends ByFields
                ? never
                : P extends string
                  ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
                  : [
                      Error,
                      "Field ",
                      P,
                      ` in "having" needs to be provided in "by"`,
                    ];
            }[HavingFields]
          : "take" extends Keys<T>
            ? "orderBy" extends Keys<T>
              ? ByValid extends True
                ? {}
                : {
                    [P in OrderFields]: P extends ByFields
                      ? never
                      : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`;
                  }[OrderFields]
              : 'Error: If you provide "take", you also need to provide "orderBy"'
            : "skip" extends Keys<T>
              ? "orderBy" extends Keys<T>
                ? ByValid extends True
                  ? {}
                  : {
                      [P in OrderFields]: P extends ByFields
                        ? never
                        : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`;
                    }[OrderFields]
                : 'Error: If you provide "skip", you also need to provide "orderBy"'
              : ByValid extends True
                ? {}
                : {
                    [P in OrderFields]: P extends ByFields
                      ? never
                      : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`;
                  }[OrderFields],
    >(
      args: SubsetIntersection<T, DriveGroupByArgs, OrderByArg> & InputErrors,
    ): {} extends InputErrors
      ? GetDriveGroupByPayload<T>
      : Prisma.PrismaPromise<InputErrors>;
    /**
     * Fields of the Drive model
     */
    readonly fields: DriveFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for Drive.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__DriveClient<
    T,
    Null = never,
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise";
    driveDocuments<T extends Drive$driveDocumentsArgs<ExtArgs> = {}>(
      args?: Subset<T, Drive$driveDocumentsArgs<ExtArgs>>,
    ): Prisma.PrismaPromise<
      | $Result.GetResult<Prisma.$DriveDocumentPayload<ExtArgs>, T, "findMany">
      | Null
    >;
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(
      onfulfilled?:
        | ((value: T) => TResult1 | PromiseLike<TResult1>)
        | undefined
        | null,
      onrejected?:
        | ((reason: any) => TResult2 | PromiseLike<TResult2>)
        | undefined
        | null,
    ): $Utils.JsPromise<TResult1 | TResult2>;
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(
      onrejected?:
        | ((reason: any) => TResult | PromiseLike<TResult>)
        | undefined
        | null,
    ): $Utils.JsPromise<T | TResult>;
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>;
  }

  /**
   * Fields of the Drive model
   */
  interface DriveFieldRefs {
    readonly id: FieldRef<"Drive", "String">;
  }

  // Custom InputTypes
  /**
   * Drive findUnique
   */
  export type DriveFindUniqueArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * Select specific fields to fetch from the Drive
     */
    select?: DriveSelect<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: DriveInclude<ExtArgs> | null;
    /**
     * Filter, which Drive to fetch.
     */
    where: DriveWhereUniqueInput;
  };

  /**
   * Drive findUniqueOrThrow
   */
  export type DriveFindUniqueOrThrowArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * Select specific fields to fetch from the Drive
     */
    select?: DriveSelect<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: DriveInclude<ExtArgs> | null;
    /**
     * Filter, which Drive to fetch.
     */
    where: DriveWhereUniqueInput;
  };

  /**
   * Drive findFirst
   */
  export type DriveFindFirstArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * Select specific fields to fetch from the Drive
     */
    select?: DriveSelect<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: DriveInclude<ExtArgs> | null;
    /**
     * Filter, which Drive to fetch.
     */
    where?: DriveWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of Drives to fetch.
     */
    orderBy?: DriveOrderByWithRelationInput | DriveOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the position for searching for Drives.
     */
    cursor?: DriveWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` Drives from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` Drives.
     */
    skip?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     *
     * Filter by unique combinations of Drives.
     */
    distinct?: DriveScalarFieldEnum | DriveScalarFieldEnum[];
  };

  /**
   * Drive findFirstOrThrow
   */
  export type DriveFindFirstOrThrowArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * Select specific fields to fetch from the Drive
     */
    select?: DriveSelect<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: DriveInclude<ExtArgs> | null;
    /**
     * Filter, which Drive to fetch.
     */
    where?: DriveWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of Drives to fetch.
     */
    orderBy?: DriveOrderByWithRelationInput | DriveOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the position for searching for Drives.
     */
    cursor?: DriveWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` Drives from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` Drives.
     */
    skip?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     *
     * Filter by unique combinations of Drives.
     */
    distinct?: DriveScalarFieldEnum | DriveScalarFieldEnum[];
  };

  /**
   * Drive findMany
   */
  export type DriveFindManyArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * Select specific fields to fetch from the Drive
     */
    select?: DriveSelect<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: DriveInclude<ExtArgs> | null;
    /**
     * Filter, which Drives to fetch.
     */
    where?: DriveWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of Drives to fetch.
     */
    orderBy?: DriveOrderByWithRelationInput | DriveOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the position for listing Drives.
     */
    cursor?: DriveWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` Drives from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` Drives.
     */
    skip?: number;
    distinct?: DriveScalarFieldEnum | DriveScalarFieldEnum[];
  };

  /**
   * Drive create
   */
  export type DriveCreateArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * Select specific fields to fetch from the Drive
     */
    select?: DriveSelect<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: DriveInclude<ExtArgs> | null;
    /**
     * The data needed to create a Drive.
     */
    data: XOR<DriveCreateInput, DriveUncheckedCreateInput>;
  };

  /**
   * Drive createMany
   */
  export type DriveCreateManyArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * The data used to create many Drives.
     */
    data: DriveCreateManyInput | DriveCreateManyInput[];
    skipDuplicates?: boolean;
  };

  /**
   * Drive createManyAndReturn
   */
  export type DriveCreateManyAndReturnArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * Select specific fields to fetch from the Drive
     */
    select?: DriveSelectCreateManyAndReturn<ExtArgs> | null;
    /**
     * The data used to create many Drives.
     */
    data: DriveCreateManyInput | DriveCreateManyInput[];
    skipDuplicates?: boolean;
  };

  /**
   * Drive update
   */
  export type DriveUpdateArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * Select specific fields to fetch from the Drive
     */
    select?: DriveSelect<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: DriveInclude<ExtArgs> | null;
    /**
     * The data needed to update a Drive.
     */
    data: XOR<DriveUpdateInput, DriveUncheckedUpdateInput>;
    /**
     * Choose, which Drive to update.
     */
    where: DriveWhereUniqueInput;
  };

  /**
   * Drive updateMany
   */
  export type DriveUpdateManyArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * The data used to update Drives.
     */
    data: XOR<DriveUpdateManyMutationInput, DriveUncheckedUpdateManyInput>;
    /**
     * Filter which Drives to update
     */
    where?: DriveWhereInput;
  };

  /**
   * Drive upsert
   */
  export type DriveUpsertArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * Select specific fields to fetch from the Drive
     */
    select?: DriveSelect<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: DriveInclude<ExtArgs> | null;
    /**
     * The filter to search for the Drive to update in case it exists.
     */
    where: DriveWhereUniqueInput;
    /**
     * In case the Drive found by the `where` argument doesn't exist, create a new Drive with this data.
     */
    create: XOR<DriveCreateInput, DriveUncheckedCreateInput>;
    /**
     * In case the Drive was found with the provided `where` argument, update it with this data.
     */
    update: XOR<DriveUpdateInput, DriveUncheckedUpdateInput>;
  };

  /**
   * Drive delete
   */
  export type DriveDeleteArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * Select specific fields to fetch from the Drive
     */
    select?: DriveSelect<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: DriveInclude<ExtArgs> | null;
    /**
     * Filter which Drive to delete.
     */
    where: DriveWhereUniqueInput;
  };

  /**
   * Drive deleteMany
   */
  export type DriveDeleteManyArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * Filter which Drives to delete
     */
    where?: DriveWhereInput;
  };

  /**
   * Drive.driveDocuments
   */
  export type Drive$driveDocumentsArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * Select specific fields to fetch from the DriveDocument
     */
    select?: DriveDocumentSelect<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: DriveDocumentInclude<ExtArgs> | null;
    where?: DriveDocumentWhereInput;
    orderBy?:
      | DriveDocumentOrderByWithRelationInput
      | DriveDocumentOrderByWithRelationInput[];
    cursor?: DriveDocumentWhereUniqueInput;
    take?: number;
    skip?: number;
    distinct?: DriveDocumentScalarFieldEnum | DriveDocumentScalarFieldEnum[];
  };

  /**
   * Drive without action
   */
  export type DriveDefaultArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * Select specific fields to fetch from the Drive
     */
    select?: DriveSelect<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: DriveInclude<ExtArgs> | null;
  };

  /**
   * Model Document
   */

  export type AggregateDocument = {
    _count: DocumentCountAggregateOutputType | null;
    _avg: DocumentAvgAggregateOutputType | null;
    _sum: DocumentSumAggregateOutputType | null;
    _min: DocumentMinAggregateOutputType | null;
    _max: DocumentMaxAggregateOutputType | null;
  };

  export type DocumentAvgAggregateOutputType = {
    ordinal: number | null;
  };

  export type DocumentSumAggregateOutputType = {
    ordinal: number | null;
  };

  export type DocumentMinAggregateOutputType = {
    id: string | null;
    ordinal: number | null;
    created: Date | null;
    lastModified: Date | null;
    slug: string | null;
    revision: string | null;
    name: string | null;
    initialState: string | null;
    documentType: string | null;
    meta: string | null;
  };

  export type DocumentMaxAggregateOutputType = {
    id: string | null;
    ordinal: number | null;
    created: Date | null;
    lastModified: Date | null;
    slug: string | null;
    revision: string | null;
    name: string | null;
    initialState: string | null;
    documentType: string | null;
    meta: string | null;
  };

  export type DocumentCountAggregateOutputType = {
    id: number;
    ordinal: number;
    created: number;
    lastModified: number;
    slug: number;
    revision: number;
    name: number;
    initialState: number;
    documentType: number;
    meta: number;
    scopes: number;
    _all: number;
  };

  export type DocumentAvgAggregateInputType = {
    ordinal?: true;
  };

  export type DocumentSumAggregateInputType = {
    ordinal?: true;
  };

  export type DocumentMinAggregateInputType = {
    id?: true;
    ordinal?: true;
    created?: true;
    lastModified?: true;
    slug?: true;
    revision?: true;
    name?: true;
    initialState?: true;
    documentType?: true;
    meta?: true;
  };

  export type DocumentMaxAggregateInputType = {
    id?: true;
    ordinal?: true;
    created?: true;
    lastModified?: true;
    slug?: true;
    revision?: true;
    name?: true;
    initialState?: true;
    documentType?: true;
    meta?: true;
  };

  export type DocumentCountAggregateInputType = {
    id?: true;
    ordinal?: true;
    created?: true;
    lastModified?: true;
    slug?: true;
    revision?: true;
    name?: true;
    initialState?: true;
    documentType?: true;
    meta?: true;
    scopes?: true;
    _all?: true;
  };

  export type DocumentAggregateArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * Filter which Document to aggregate.
     */
    where?: DocumentWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of Documents to fetch.
     */
    orderBy?:
      | DocumentOrderByWithRelationInput
      | DocumentOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the start position
     */
    cursor?: DocumentWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` Documents from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` Documents.
     */
    skip?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Count returned Documents
     **/
    _count?: true | DocumentCountAggregateInputType;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Select which fields to average
     **/
    _avg?: DocumentAvgAggregateInputType;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Select which fields to sum
     **/
    _sum?: DocumentSumAggregateInputType;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Select which fields to find the minimum value
     **/
    _min?: DocumentMinAggregateInputType;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Select which fields to find the maximum value
     **/
    _max?: DocumentMaxAggregateInputType;
  };

  export type GetDocumentAggregateType<T extends DocumentAggregateArgs> = {
    [P in keyof T & keyof AggregateDocument]: P extends "_count" | "count"
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateDocument[P]>
      : GetScalarType<T[P], AggregateDocument[P]>;
  };

  export type DocumentGroupByArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    where?: DocumentWhereInput;
    orderBy?:
      | DocumentOrderByWithAggregationInput
      | DocumentOrderByWithAggregationInput[];
    by: DocumentScalarFieldEnum[] | DocumentScalarFieldEnum;
    having?: DocumentScalarWhereWithAggregatesInput;
    take?: number;
    skip?: number;
    _count?: DocumentCountAggregateInputType | true;
    _avg?: DocumentAvgAggregateInputType;
    _sum?: DocumentSumAggregateInputType;
    _min?: DocumentMinAggregateInputType;
    _max?: DocumentMaxAggregateInputType;
  };

  export type DocumentGroupByOutputType = {
    id: string;
    ordinal: number;
    created: Date;
    lastModified: Date;
    slug: string | null;
    revision: string;
    name: string | null;
    initialState: string;
    documentType: string;
    meta: string | null;
    scopes: string[];
    _count: DocumentCountAggregateOutputType | null;
    _avg: DocumentAvgAggregateOutputType | null;
    _sum: DocumentSumAggregateOutputType | null;
    _min: DocumentMinAggregateOutputType | null;
    _max: DocumentMaxAggregateOutputType | null;
  };

  type GetDocumentGroupByPayload<T extends DocumentGroupByArgs> =
    Prisma.PrismaPromise<
      Array<
        PickEnumerable<DocumentGroupByOutputType, T["by"]> & {
          [P in keyof T & keyof DocumentGroupByOutputType]: P extends "_count"
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], DocumentGroupByOutputType[P]>
            : GetScalarType<T[P], DocumentGroupByOutputType[P]>;
        }
      >
    >;

  export type DocumentSelect<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = $Extensions.GetSelect<
    {
      id?: boolean;
      ordinal?: boolean;
      created?: boolean;
      lastModified?: boolean;
      slug?: boolean;
      revision?: boolean;
      name?: boolean;
      initialState?: boolean;
      documentType?: boolean;
      meta?: boolean;
      scopes?: boolean;
      operations?: boolean | Document$operationsArgs<ExtArgs>;
      synchronizationUnits?:
        | boolean
        | Document$synchronizationUnitsArgs<ExtArgs>;
      _count?: boolean | DocumentCountOutputTypeDefaultArgs<ExtArgs>;
    },
    ExtArgs["result"]["document"]
  >;

  export type DocumentSelectCreateManyAndReturn<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = $Extensions.GetSelect<
    {
      id?: boolean;
      ordinal?: boolean;
      created?: boolean;
      lastModified?: boolean;
      slug?: boolean;
      revision?: boolean;
      name?: boolean;
      initialState?: boolean;
      documentType?: boolean;
      meta?: boolean;
      scopes?: boolean;
    },
    ExtArgs["result"]["document"]
  >;

  export type DocumentSelectScalar = {
    id?: boolean;
    ordinal?: boolean;
    created?: boolean;
    lastModified?: boolean;
    slug?: boolean;
    revision?: boolean;
    name?: boolean;
    initialState?: boolean;
    documentType?: boolean;
    meta?: boolean;
    scopes?: boolean;
  };

  export type DocumentInclude<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    operations?: boolean | Document$operationsArgs<ExtArgs>;
    synchronizationUnits?: boolean | Document$synchronizationUnitsArgs<ExtArgs>;
    _count?: boolean | DocumentCountOutputTypeDefaultArgs<ExtArgs>;
  };
  export type DocumentIncludeCreateManyAndReturn<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {};

  export type $DocumentPayload<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    name: "Document";
    objects: {
      operations: Prisma.$OperationPayload<ExtArgs>[];
      synchronizationUnits: Prisma.$SynchronizationUnitPayload<ExtArgs>[];
    };
    scalars: $Extensions.GetPayloadResult<
      {
        id: string;
        ordinal: number;
        created: Date;
        lastModified: Date;
        slug: string | null;
        revision: string;
        name: string | null;
        initialState: string;
        documentType: string;
        meta: string | null;
        scopes: string[];
      },
      ExtArgs["result"]["document"]
    >;
    composites: {};
  };

  type DocumentGetPayload<
    S extends boolean | null | undefined | DocumentDefaultArgs,
  > = $Result.GetResult<Prisma.$DocumentPayload, S>;

  type DocumentCountArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = Omit<DocumentFindManyArgs, "select" | "include" | "distinct"> & {
    select?: DocumentCountAggregateInputType | true;
  };

  export interface DocumentDelegate<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > {
    [K: symbol]: {
      types: Prisma.TypeMap<ExtArgs>["model"]["Document"];
      meta: { name: "Document" };
    };
    /**
     * Find zero or one Document that matches the filter.
     * @param {DocumentFindUniqueArgs} args - Arguments to find a Document
     * @example
     * // Get one Document
     * const document = await prisma.document.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends DocumentFindUniqueArgs>(
      args: SelectSubset<T, DocumentFindUniqueArgs<ExtArgs>>,
    ): Prisma__DocumentClient<
      $Result.GetResult<
        Prisma.$DocumentPayload<ExtArgs>,
        T,
        "findUnique"
      > | null,
      null,
      ExtArgs
    >;

    /**
     * Find one Document that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {DocumentFindUniqueOrThrowArgs} args - Arguments to find a Document
     * @example
     * // Get one Document
     * const document = await prisma.document.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends DocumentFindUniqueOrThrowArgs>(
      args: SelectSubset<T, DocumentFindUniqueOrThrowArgs<ExtArgs>>,
    ): Prisma__DocumentClient<
      $Result.GetResult<
        Prisma.$DocumentPayload<ExtArgs>,
        T,
        "findUniqueOrThrow"
      >,
      never,
      ExtArgs
    >;

    /**
     * Find the first Document that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {DocumentFindFirstArgs} args - Arguments to find a Document
     * @example
     * // Get one Document
     * const document = await prisma.document.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends DocumentFindFirstArgs>(
      args?: SelectSubset<T, DocumentFindFirstArgs<ExtArgs>>,
    ): Prisma__DocumentClient<
      $Result.GetResult<
        Prisma.$DocumentPayload<ExtArgs>,
        T,
        "findFirst"
      > | null,
      null,
      ExtArgs
    >;

    /**
     * Find the first Document that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {DocumentFindFirstOrThrowArgs} args - Arguments to find a Document
     * @example
     * // Get one Document
     * const document = await prisma.document.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends DocumentFindFirstOrThrowArgs>(
      args?: SelectSubset<T, DocumentFindFirstOrThrowArgs<ExtArgs>>,
    ): Prisma__DocumentClient<
      $Result.GetResult<
        Prisma.$DocumentPayload<ExtArgs>,
        T,
        "findFirstOrThrow"
      >,
      never,
      ExtArgs
    >;

    /**
     * Find zero or more Documents that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {DocumentFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all Documents
     * const documents = await prisma.document.findMany()
     *
     * // Get first 10 Documents
     * const documents = await prisma.document.findMany({ take: 10 })
     *
     * // Only select the `id`
     * const documentWithIdOnly = await prisma.document.findMany({ select: { id: true } })
     *
     */
    findMany<T extends DocumentFindManyArgs>(
      args?: SelectSubset<T, DocumentFindManyArgs<ExtArgs>>,
    ): Prisma.PrismaPromise<
      $Result.GetResult<Prisma.$DocumentPayload<ExtArgs>, T, "findMany">
    >;

    /**
     * Create a Document.
     * @param {DocumentCreateArgs} args - Arguments to create a Document.
     * @example
     * // Create one Document
     * const Document = await prisma.document.create({
     *   data: {
     *     // ... data to create a Document
     *   }
     * })
     *
     */
    create<T extends DocumentCreateArgs>(
      args: SelectSubset<T, DocumentCreateArgs<ExtArgs>>,
    ): Prisma__DocumentClient<
      $Result.GetResult<Prisma.$DocumentPayload<ExtArgs>, T, "create">,
      never,
      ExtArgs
    >;

    /**
     * Create many Documents.
     * @param {DocumentCreateManyArgs} args - Arguments to create many Documents.
     * @example
     * // Create many Documents
     * const document = await prisma.document.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *
     */
    createMany<T extends DocumentCreateManyArgs>(
      args?: SelectSubset<T, DocumentCreateManyArgs<ExtArgs>>,
    ): Prisma.PrismaPromise<BatchPayload>;

    /**
     * Create many Documents and returns the data saved in the database.
     * @param {DocumentCreateManyAndReturnArgs} args - Arguments to create many Documents.
     * @example
     * // Create many Documents
     * const document = await prisma.document.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *
     * // Create many Documents and only return the `id`
     * const documentWithIdOnly = await prisma.document.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     *
     */
    createManyAndReturn<T extends DocumentCreateManyAndReturnArgs>(
      args?: SelectSubset<T, DocumentCreateManyAndReturnArgs<ExtArgs>>,
    ): Prisma.PrismaPromise<
      $Result.GetResult<
        Prisma.$DocumentPayload<ExtArgs>,
        T,
        "createManyAndReturn"
      >
    >;

    /**
     * Delete a Document.
     * @param {DocumentDeleteArgs} args - Arguments to delete one Document.
     * @example
     * // Delete one Document
     * const Document = await prisma.document.delete({
     *   where: {
     *     // ... filter to delete one Document
     *   }
     * })
     *
     */
    delete<T extends DocumentDeleteArgs>(
      args: SelectSubset<T, DocumentDeleteArgs<ExtArgs>>,
    ): Prisma__DocumentClient<
      $Result.GetResult<Prisma.$DocumentPayload<ExtArgs>, T, "delete">,
      never,
      ExtArgs
    >;

    /**
     * Update one Document.
     * @param {DocumentUpdateArgs} args - Arguments to update one Document.
     * @example
     * // Update one Document
     * const document = await prisma.document.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     *
     */
    update<T extends DocumentUpdateArgs>(
      args: SelectSubset<T, DocumentUpdateArgs<ExtArgs>>,
    ): Prisma__DocumentClient<
      $Result.GetResult<Prisma.$DocumentPayload<ExtArgs>, T, "update">,
      never,
      ExtArgs
    >;

    /**
     * Delete zero or more Documents.
     * @param {DocumentDeleteManyArgs} args - Arguments to filter Documents to delete.
     * @example
     * // Delete a few Documents
     * const { count } = await prisma.document.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     *
     */
    deleteMany<T extends DocumentDeleteManyArgs>(
      args?: SelectSubset<T, DocumentDeleteManyArgs<ExtArgs>>,
    ): Prisma.PrismaPromise<BatchPayload>;

    /**
     * Update zero or more Documents.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {DocumentUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many Documents
     * const document = await prisma.document.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     *
     */
    updateMany<T extends DocumentUpdateManyArgs>(
      args: SelectSubset<T, DocumentUpdateManyArgs<ExtArgs>>,
    ): Prisma.PrismaPromise<BatchPayload>;

    /**
     * Create or update one Document.
     * @param {DocumentUpsertArgs} args - Arguments to update or create a Document.
     * @example
     * // Update or create a Document
     * const document = await prisma.document.upsert({
     *   create: {
     *     // ... data to create a Document
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the Document we want to update
     *   }
     * })
     */
    upsert<T extends DocumentUpsertArgs>(
      args: SelectSubset<T, DocumentUpsertArgs<ExtArgs>>,
    ): Prisma__DocumentClient<
      $Result.GetResult<Prisma.$DocumentPayload<ExtArgs>, T, "upsert">,
      never,
      ExtArgs
    >;

    /**
     * Count the number of Documents.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {DocumentCountArgs} args - Arguments to filter Documents to count.
     * @example
     * // Count the number of Documents
     * const count = await prisma.document.count({
     *   where: {
     *     // ... the filter for the Documents we want to count
     *   }
     * })
     **/
    count<T extends DocumentCountArgs>(
      args?: Subset<T, DocumentCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<"select", any>
        ? T["select"] extends true
          ? number
          : GetScalarType<T["select"], DocumentCountAggregateOutputType>
        : number
    >;

    /**
     * Allows you to perform aggregations operations on a Document.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {DocumentAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
     **/
    aggregate<T extends DocumentAggregateArgs>(
      args: Subset<T, DocumentAggregateArgs>,
    ): Prisma.PrismaPromise<GetDocumentAggregateType<T>>;

    /**
     * Group by Document.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {DocumentGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     *
     **/
    groupBy<
      T extends DocumentGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<"skip", Keys<T>>,
        Extends<"take", Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: DocumentGroupByArgs["orderBy"] }
        : { orderBy?: DocumentGroupByArgs["orderBy"] },
      OrderFields extends ExcludeUnderscoreKeys<
        Keys<MaybeTupleToUnion<T["orderBy"]>>
      >,
      ByFields extends MaybeTupleToUnion<T["by"]>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T["having"]>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T["by"] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
        ? `Error: "by" must not be empty.`
        : HavingValid extends False
          ? {
              [P in HavingFields]: P extends ByFields
                ? never
                : P extends string
                  ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
                  : [
                      Error,
                      "Field ",
                      P,
                      ` in "having" needs to be provided in "by"`,
                    ];
            }[HavingFields]
          : "take" extends Keys<T>
            ? "orderBy" extends Keys<T>
              ? ByValid extends True
                ? {}
                : {
                    [P in OrderFields]: P extends ByFields
                      ? never
                      : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`;
                  }[OrderFields]
              : 'Error: If you provide "take", you also need to provide "orderBy"'
            : "skip" extends Keys<T>
              ? "orderBy" extends Keys<T>
                ? ByValid extends True
                  ? {}
                  : {
                      [P in OrderFields]: P extends ByFields
                        ? never
                        : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`;
                    }[OrderFields]
                : 'Error: If you provide "skip", you also need to provide "orderBy"'
              : ByValid extends True
                ? {}
                : {
                    [P in OrderFields]: P extends ByFields
                      ? never
                      : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`;
                  }[OrderFields],
    >(
      args: SubsetIntersection<T, DocumentGroupByArgs, OrderByArg> &
        InputErrors,
    ): {} extends InputErrors
      ? GetDocumentGroupByPayload<T>
      : Prisma.PrismaPromise<InputErrors>;
    /**
     * Fields of the Document model
     */
    readonly fields: DocumentFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for Document.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__DocumentClient<
    T,
    Null = never,
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise";
    operations<T extends Document$operationsArgs<ExtArgs> = {}>(
      args?: Subset<T, Document$operationsArgs<ExtArgs>>,
    ): Prisma.PrismaPromise<
      $Result.GetResult<Prisma.$OperationPayload<ExtArgs>, T, "findMany"> | Null
    >;
    synchronizationUnits<
      T extends Document$synchronizationUnitsArgs<ExtArgs> = {},
    >(
      args?: Subset<T, Document$synchronizationUnitsArgs<ExtArgs>>,
    ): Prisma.PrismaPromise<
      | $Result.GetResult<
          Prisma.$SynchronizationUnitPayload<ExtArgs>,
          T,
          "findMany"
        >
      | Null
    >;
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(
      onfulfilled?:
        | ((value: T) => TResult1 | PromiseLike<TResult1>)
        | undefined
        | null,
      onrejected?:
        | ((reason: any) => TResult2 | PromiseLike<TResult2>)
        | undefined
        | null,
    ): $Utils.JsPromise<TResult1 | TResult2>;
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(
      onrejected?:
        | ((reason: any) => TResult | PromiseLike<TResult>)
        | undefined
        | null,
    ): $Utils.JsPromise<T | TResult>;
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>;
  }

  /**
   * Fields of the Document model
   */
  interface DocumentFieldRefs {
    readonly id: FieldRef<"Document", "String">;
    readonly ordinal: FieldRef<"Document", "Int">;
    readonly created: FieldRef<"Document", "DateTime">;
    readonly lastModified: FieldRef<"Document", "DateTime">;
    readonly slug: FieldRef<"Document", "String">;
    readonly revision: FieldRef<"Document", "String">;
    readonly name: FieldRef<"Document", "String">;
    readonly initialState: FieldRef<"Document", "String">;
    readonly documentType: FieldRef<"Document", "String">;
    readonly meta: FieldRef<"Document", "String">;
    readonly scopes: FieldRef<"Document", "String[]">;
  }

  // Custom InputTypes
  /**
   * Document findUnique
   */
  export type DocumentFindUniqueArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * Select specific fields to fetch from the Document
     */
    select?: DocumentSelect<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: DocumentInclude<ExtArgs> | null;
    /**
     * Filter, which Document to fetch.
     */
    where: DocumentWhereUniqueInput;
  };

  /**
   * Document findUniqueOrThrow
   */
  export type DocumentFindUniqueOrThrowArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * Select specific fields to fetch from the Document
     */
    select?: DocumentSelect<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: DocumentInclude<ExtArgs> | null;
    /**
     * Filter, which Document to fetch.
     */
    where: DocumentWhereUniqueInput;
  };

  /**
   * Document findFirst
   */
  export type DocumentFindFirstArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * Select specific fields to fetch from the Document
     */
    select?: DocumentSelect<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: DocumentInclude<ExtArgs> | null;
    /**
     * Filter, which Document to fetch.
     */
    where?: DocumentWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of Documents to fetch.
     */
    orderBy?:
      | DocumentOrderByWithRelationInput
      | DocumentOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the position for searching for Documents.
     */
    cursor?: DocumentWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` Documents from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` Documents.
     */
    skip?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     *
     * Filter by unique combinations of Documents.
     */
    distinct?: DocumentScalarFieldEnum | DocumentScalarFieldEnum[];
  };

  /**
   * Document findFirstOrThrow
   */
  export type DocumentFindFirstOrThrowArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * Select specific fields to fetch from the Document
     */
    select?: DocumentSelect<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: DocumentInclude<ExtArgs> | null;
    /**
     * Filter, which Document to fetch.
     */
    where?: DocumentWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of Documents to fetch.
     */
    orderBy?:
      | DocumentOrderByWithRelationInput
      | DocumentOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the position for searching for Documents.
     */
    cursor?: DocumentWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` Documents from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` Documents.
     */
    skip?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     *
     * Filter by unique combinations of Documents.
     */
    distinct?: DocumentScalarFieldEnum | DocumentScalarFieldEnum[];
  };

  /**
   * Document findMany
   */
  export type DocumentFindManyArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * Select specific fields to fetch from the Document
     */
    select?: DocumentSelect<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: DocumentInclude<ExtArgs> | null;
    /**
     * Filter, which Documents to fetch.
     */
    where?: DocumentWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of Documents to fetch.
     */
    orderBy?:
      | DocumentOrderByWithRelationInput
      | DocumentOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the position for listing Documents.
     */
    cursor?: DocumentWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` Documents from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` Documents.
     */
    skip?: number;
    distinct?: DocumentScalarFieldEnum | DocumentScalarFieldEnum[];
  };

  /**
   * Document create
   */
  export type DocumentCreateArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * Select specific fields to fetch from the Document
     */
    select?: DocumentSelect<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: DocumentInclude<ExtArgs> | null;
    /**
     * The data needed to create a Document.
     */
    data: XOR<DocumentCreateInput, DocumentUncheckedCreateInput>;
  };

  /**
   * Document createMany
   */
  export type DocumentCreateManyArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * The data used to create many Documents.
     */
    data: DocumentCreateManyInput | DocumentCreateManyInput[];
    skipDuplicates?: boolean;
  };

  /**
   * Document createManyAndReturn
   */
  export type DocumentCreateManyAndReturnArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * Select specific fields to fetch from the Document
     */
    select?: DocumentSelectCreateManyAndReturn<ExtArgs> | null;
    /**
     * The data used to create many Documents.
     */
    data: DocumentCreateManyInput | DocumentCreateManyInput[];
    skipDuplicates?: boolean;
  };

  /**
   * Document update
   */
  export type DocumentUpdateArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * Select specific fields to fetch from the Document
     */
    select?: DocumentSelect<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: DocumentInclude<ExtArgs> | null;
    /**
     * The data needed to update a Document.
     */
    data: XOR<DocumentUpdateInput, DocumentUncheckedUpdateInput>;
    /**
     * Choose, which Document to update.
     */
    where: DocumentWhereUniqueInput;
  };

  /**
   * Document updateMany
   */
  export type DocumentUpdateManyArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * The data used to update Documents.
     */
    data: XOR<
      DocumentUpdateManyMutationInput,
      DocumentUncheckedUpdateManyInput
    >;
    /**
     * Filter which Documents to update
     */
    where?: DocumentWhereInput;
  };

  /**
   * Document upsert
   */
  export type DocumentUpsertArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * Select specific fields to fetch from the Document
     */
    select?: DocumentSelect<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: DocumentInclude<ExtArgs> | null;
    /**
     * The filter to search for the Document to update in case it exists.
     */
    where: DocumentWhereUniqueInput;
    /**
     * In case the Document found by the `where` argument doesn't exist, create a new Document with this data.
     */
    create: XOR<DocumentCreateInput, DocumentUncheckedCreateInput>;
    /**
     * In case the Document was found with the provided `where` argument, update it with this data.
     */
    update: XOR<DocumentUpdateInput, DocumentUncheckedUpdateInput>;
  };

  /**
   * Document delete
   */
  export type DocumentDeleteArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * Select specific fields to fetch from the Document
     */
    select?: DocumentSelect<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: DocumentInclude<ExtArgs> | null;
    /**
     * Filter which Document to delete.
     */
    where: DocumentWhereUniqueInput;
  };

  /**
   * Document deleteMany
   */
  export type DocumentDeleteManyArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * Filter which Documents to delete
     */
    where?: DocumentWhereInput;
  };

  /**
   * Document.operations
   */
  export type Document$operationsArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * Select specific fields to fetch from the Operation
     */
    select?: OperationSelect<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: OperationInclude<ExtArgs> | null;
    where?: OperationWhereInput;
    orderBy?:
      | OperationOrderByWithRelationInput
      | OperationOrderByWithRelationInput[];
    cursor?: OperationWhereUniqueInput;
    take?: number;
    skip?: number;
    distinct?: OperationScalarFieldEnum | OperationScalarFieldEnum[];
  };

  /**
   * Document.synchronizationUnits
   */
  export type Document$synchronizationUnitsArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * Select specific fields to fetch from the SynchronizationUnit
     */
    select?: SynchronizationUnitSelect<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SynchronizationUnitInclude<ExtArgs> | null;
    where?: SynchronizationUnitWhereInput;
    orderBy?:
      | SynchronizationUnitOrderByWithRelationInput
      | SynchronizationUnitOrderByWithRelationInput[];
    cursor?: SynchronizationUnitWhereUniqueInput;
    take?: number;
    skip?: number;
    distinct?:
      | SynchronizationUnitScalarFieldEnum
      | SynchronizationUnitScalarFieldEnum[];
  };

  /**
   * Document without action
   */
  export type DocumentDefaultArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * Select specific fields to fetch from the Document
     */
    select?: DocumentSelect<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: DocumentInclude<ExtArgs> | null;
  };

  /**
   * Model DriveDocument
   */

  export type AggregateDriveDocument = {
    _count: DriveDocumentCountAggregateOutputType | null;
    _min: DriveDocumentMinAggregateOutputType | null;
    _max: DriveDocumentMaxAggregateOutputType | null;
  };

  export type DriveDocumentMinAggregateOutputType = {
    driveId: string | null;
    documentId: string | null;
  };

  export type DriveDocumentMaxAggregateOutputType = {
    driveId: string | null;
    documentId: string | null;
  };

  export type DriveDocumentCountAggregateOutputType = {
    driveId: number;
    documentId: number;
    _all: number;
  };

  export type DriveDocumentMinAggregateInputType = {
    driveId?: true;
    documentId?: true;
  };

  export type DriveDocumentMaxAggregateInputType = {
    driveId?: true;
    documentId?: true;
  };

  export type DriveDocumentCountAggregateInputType = {
    driveId?: true;
    documentId?: true;
    _all?: true;
  };

  export type DriveDocumentAggregateArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * Filter which DriveDocument to aggregate.
     */
    where?: DriveDocumentWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of DriveDocuments to fetch.
     */
    orderBy?:
      | DriveDocumentOrderByWithRelationInput
      | DriveDocumentOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the start position
     */
    cursor?: DriveDocumentWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` DriveDocuments from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` DriveDocuments.
     */
    skip?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Count returned DriveDocuments
     **/
    _count?: true | DriveDocumentCountAggregateInputType;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Select which fields to find the minimum value
     **/
    _min?: DriveDocumentMinAggregateInputType;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Select which fields to find the maximum value
     **/
    _max?: DriveDocumentMaxAggregateInputType;
  };

  export type GetDriveDocumentAggregateType<
    T extends DriveDocumentAggregateArgs,
  > = {
    [P in keyof T & keyof AggregateDriveDocument]: P extends "_count" | "count"
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateDriveDocument[P]>
      : GetScalarType<T[P], AggregateDriveDocument[P]>;
  };

  export type DriveDocumentGroupByArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    where?: DriveDocumentWhereInput;
    orderBy?:
      | DriveDocumentOrderByWithAggregationInput
      | DriveDocumentOrderByWithAggregationInput[];
    by: DriveDocumentScalarFieldEnum[] | DriveDocumentScalarFieldEnum;
    having?: DriveDocumentScalarWhereWithAggregatesInput;
    take?: number;
    skip?: number;
    _count?: DriveDocumentCountAggregateInputType | true;
    _min?: DriveDocumentMinAggregateInputType;
    _max?: DriveDocumentMaxAggregateInputType;
  };

  export type DriveDocumentGroupByOutputType = {
    driveId: string;
    documentId: string;
    _count: DriveDocumentCountAggregateOutputType | null;
    _min: DriveDocumentMinAggregateOutputType | null;
    _max: DriveDocumentMaxAggregateOutputType | null;
  };

  type GetDriveDocumentGroupByPayload<T extends DriveDocumentGroupByArgs> =
    Prisma.PrismaPromise<
      Array<
        PickEnumerable<DriveDocumentGroupByOutputType, T["by"]> & {
          [P in keyof T &
            keyof DriveDocumentGroupByOutputType]: P extends "_count"
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], DriveDocumentGroupByOutputType[P]>
            : GetScalarType<T[P], DriveDocumentGroupByOutputType[P]>;
        }
      >
    >;

  export type DriveDocumentSelect<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = $Extensions.GetSelect<
    {
      driveId?: boolean;
      documentId?: boolean;
      drive?: boolean | DriveDefaultArgs<ExtArgs>;
    },
    ExtArgs["result"]["driveDocument"]
  >;

  export type DriveDocumentSelectCreateManyAndReturn<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = $Extensions.GetSelect<
    {
      driveId?: boolean;
      documentId?: boolean;
      drive?: boolean | DriveDefaultArgs<ExtArgs>;
    },
    ExtArgs["result"]["driveDocument"]
  >;

  export type DriveDocumentSelectScalar = {
    driveId?: boolean;
    documentId?: boolean;
  };

  export type DriveDocumentInclude<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    drive?: boolean | DriveDefaultArgs<ExtArgs>;
  };
  export type DriveDocumentIncludeCreateManyAndReturn<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    drive?: boolean | DriveDefaultArgs<ExtArgs>;
  };

  export type $DriveDocumentPayload<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    name: "DriveDocument";
    objects: {
      drive: Prisma.$DrivePayload<ExtArgs>;
    };
    scalars: $Extensions.GetPayloadResult<
      {
        driveId: string;
        documentId: string;
      },
      ExtArgs["result"]["driveDocument"]
    >;
    composites: {};
  };

  type DriveDocumentGetPayload<
    S extends boolean | null | undefined | DriveDocumentDefaultArgs,
  > = $Result.GetResult<Prisma.$DriveDocumentPayload, S>;

  type DriveDocumentCountArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = Omit<DriveDocumentFindManyArgs, "select" | "include" | "distinct"> & {
    select?: DriveDocumentCountAggregateInputType | true;
  };

  export interface DriveDocumentDelegate<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > {
    [K: symbol]: {
      types: Prisma.TypeMap<ExtArgs>["model"]["DriveDocument"];
      meta: { name: "DriveDocument" };
    };
    /**
     * Find zero or one DriveDocument that matches the filter.
     * @param {DriveDocumentFindUniqueArgs} args - Arguments to find a DriveDocument
     * @example
     * // Get one DriveDocument
     * const driveDocument = await prisma.driveDocument.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends DriveDocumentFindUniqueArgs>(
      args: SelectSubset<T, DriveDocumentFindUniqueArgs<ExtArgs>>,
    ): Prisma__DriveDocumentClient<
      $Result.GetResult<
        Prisma.$DriveDocumentPayload<ExtArgs>,
        T,
        "findUnique"
      > | null,
      null,
      ExtArgs
    >;

    /**
     * Find one DriveDocument that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {DriveDocumentFindUniqueOrThrowArgs} args - Arguments to find a DriveDocument
     * @example
     * // Get one DriveDocument
     * const driveDocument = await prisma.driveDocument.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends DriveDocumentFindUniqueOrThrowArgs>(
      args: SelectSubset<T, DriveDocumentFindUniqueOrThrowArgs<ExtArgs>>,
    ): Prisma__DriveDocumentClient<
      $Result.GetResult<
        Prisma.$DriveDocumentPayload<ExtArgs>,
        T,
        "findUniqueOrThrow"
      >,
      never,
      ExtArgs
    >;

    /**
     * Find the first DriveDocument that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {DriveDocumentFindFirstArgs} args - Arguments to find a DriveDocument
     * @example
     * // Get one DriveDocument
     * const driveDocument = await prisma.driveDocument.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends DriveDocumentFindFirstArgs>(
      args?: SelectSubset<T, DriveDocumentFindFirstArgs<ExtArgs>>,
    ): Prisma__DriveDocumentClient<
      $Result.GetResult<
        Prisma.$DriveDocumentPayload<ExtArgs>,
        T,
        "findFirst"
      > | null,
      null,
      ExtArgs
    >;

    /**
     * Find the first DriveDocument that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {DriveDocumentFindFirstOrThrowArgs} args - Arguments to find a DriveDocument
     * @example
     * // Get one DriveDocument
     * const driveDocument = await prisma.driveDocument.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends DriveDocumentFindFirstOrThrowArgs>(
      args?: SelectSubset<T, DriveDocumentFindFirstOrThrowArgs<ExtArgs>>,
    ): Prisma__DriveDocumentClient<
      $Result.GetResult<
        Prisma.$DriveDocumentPayload<ExtArgs>,
        T,
        "findFirstOrThrow"
      >,
      never,
      ExtArgs
    >;

    /**
     * Find zero or more DriveDocuments that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {DriveDocumentFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all DriveDocuments
     * const driveDocuments = await prisma.driveDocument.findMany()
     *
     * // Get first 10 DriveDocuments
     * const driveDocuments = await prisma.driveDocument.findMany({ take: 10 })
     *
     * // Only select the `driveId`
     * const driveDocumentWithDriveIdOnly = await prisma.driveDocument.findMany({ select: { driveId: true } })
     *
     */
    findMany<T extends DriveDocumentFindManyArgs>(
      args?: SelectSubset<T, DriveDocumentFindManyArgs<ExtArgs>>,
    ): Prisma.PrismaPromise<
      $Result.GetResult<Prisma.$DriveDocumentPayload<ExtArgs>, T, "findMany">
    >;

    /**
     * Create a DriveDocument.
     * @param {DriveDocumentCreateArgs} args - Arguments to create a DriveDocument.
     * @example
     * // Create one DriveDocument
     * const DriveDocument = await prisma.driveDocument.create({
     *   data: {
     *     // ... data to create a DriveDocument
     *   }
     * })
     *
     */
    create<T extends DriveDocumentCreateArgs>(
      args: SelectSubset<T, DriveDocumentCreateArgs<ExtArgs>>,
    ): Prisma__DriveDocumentClient<
      $Result.GetResult<Prisma.$DriveDocumentPayload<ExtArgs>, T, "create">,
      never,
      ExtArgs
    >;

    /**
     * Create many DriveDocuments.
     * @param {DriveDocumentCreateManyArgs} args - Arguments to create many DriveDocuments.
     * @example
     * // Create many DriveDocuments
     * const driveDocument = await prisma.driveDocument.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *
     */
    createMany<T extends DriveDocumentCreateManyArgs>(
      args?: SelectSubset<T, DriveDocumentCreateManyArgs<ExtArgs>>,
    ): Prisma.PrismaPromise<BatchPayload>;

    /**
     * Create many DriveDocuments and returns the data saved in the database.
     * @param {DriveDocumentCreateManyAndReturnArgs} args - Arguments to create many DriveDocuments.
     * @example
     * // Create many DriveDocuments
     * const driveDocument = await prisma.driveDocument.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *
     * // Create many DriveDocuments and only return the `driveId`
     * const driveDocumentWithDriveIdOnly = await prisma.driveDocument.createManyAndReturn({
     *   select: { driveId: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     *
     */
    createManyAndReturn<T extends DriveDocumentCreateManyAndReturnArgs>(
      args?: SelectSubset<T, DriveDocumentCreateManyAndReturnArgs<ExtArgs>>,
    ): Prisma.PrismaPromise<
      $Result.GetResult<
        Prisma.$DriveDocumentPayload<ExtArgs>,
        T,
        "createManyAndReturn"
      >
    >;

    /**
     * Delete a DriveDocument.
     * @param {DriveDocumentDeleteArgs} args - Arguments to delete one DriveDocument.
     * @example
     * // Delete one DriveDocument
     * const DriveDocument = await prisma.driveDocument.delete({
     *   where: {
     *     // ... filter to delete one DriveDocument
     *   }
     * })
     *
     */
    delete<T extends DriveDocumentDeleteArgs>(
      args: SelectSubset<T, DriveDocumentDeleteArgs<ExtArgs>>,
    ): Prisma__DriveDocumentClient<
      $Result.GetResult<Prisma.$DriveDocumentPayload<ExtArgs>, T, "delete">,
      never,
      ExtArgs
    >;

    /**
     * Update one DriveDocument.
     * @param {DriveDocumentUpdateArgs} args - Arguments to update one DriveDocument.
     * @example
     * // Update one DriveDocument
     * const driveDocument = await prisma.driveDocument.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     *
     */
    update<T extends DriveDocumentUpdateArgs>(
      args: SelectSubset<T, DriveDocumentUpdateArgs<ExtArgs>>,
    ): Prisma__DriveDocumentClient<
      $Result.GetResult<Prisma.$DriveDocumentPayload<ExtArgs>, T, "update">,
      never,
      ExtArgs
    >;

    /**
     * Delete zero or more DriveDocuments.
     * @param {DriveDocumentDeleteManyArgs} args - Arguments to filter DriveDocuments to delete.
     * @example
     * // Delete a few DriveDocuments
     * const { count } = await prisma.driveDocument.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     *
     */
    deleteMany<T extends DriveDocumentDeleteManyArgs>(
      args?: SelectSubset<T, DriveDocumentDeleteManyArgs<ExtArgs>>,
    ): Prisma.PrismaPromise<BatchPayload>;

    /**
     * Update zero or more DriveDocuments.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {DriveDocumentUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many DriveDocuments
     * const driveDocument = await prisma.driveDocument.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     *
     */
    updateMany<T extends DriveDocumentUpdateManyArgs>(
      args: SelectSubset<T, DriveDocumentUpdateManyArgs<ExtArgs>>,
    ): Prisma.PrismaPromise<BatchPayload>;

    /**
     * Create or update one DriveDocument.
     * @param {DriveDocumentUpsertArgs} args - Arguments to update or create a DriveDocument.
     * @example
     * // Update or create a DriveDocument
     * const driveDocument = await prisma.driveDocument.upsert({
     *   create: {
     *     // ... data to create a DriveDocument
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the DriveDocument we want to update
     *   }
     * })
     */
    upsert<T extends DriveDocumentUpsertArgs>(
      args: SelectSubset<T, DriveDocumentUpsertArgs<ExtArgs>>,
    ): Prisma__DriveDocumentClient<
      $Result.GetResult<Prisma.$DriveDocumentPayload<ExtArgs>, T, "upsert">,
      never,
      ExtArgs
    >;

    /**
     * Count the number of DriveDocuments.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {DriveDocumentCountArgs} args - Arguments to filter DriveDocuments to count.
     * @example
     * // Count the number of DriveDocuments
     * const count = await prisma.driveDocument.count({
     *   where: {
     *     // ... the filter for the DriveDocuments we want to count
     *   }
     * })
     **/
    count<T extends DriveDocumentCountArgs>(
      args?: Subset<T, DriveDocumentCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<"select", any>
        ? T["select"] extends true
          ? number
          : GetScalarType<T["select"], DriveDocumentCountAggregateOutputType>
        : number
    >;

    /**
     * Allows you to perform aggregations operations on a DriveDocument.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {DriveDocumentAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
     **/
    aggregate<T extends DriveDocumentAggregateArgs>(
      args: Subset<T, DriveDocumentAggregateArgs>,
    ): Prisma.PrismaPromise<GetDriveDocumentAggregateType<T>>;

    /**
     * Group by DriveDocument.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {DriveDocumentGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     *
     **/
    groupBy<
      T extends DriveDocumentGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<"skip", Keys<T>>,
        Extends<"take", Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: DriveDocumentGroupByArgs["orderBy"] }
        : { orderBy?: DriveDocumentGroupByArgs["orderBy"] },
      OrderFields extends ExcludeUnderscoreKeys<
        Keys<MaybeTupleToUnion<T["orderBy"]>>
      >,
      ByFields extends MaybeTupleToUnion<T["by"]>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T["having"]>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T["by"] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
        ? `Error: "by" must not be empty.`
        : HavingValid extends False
          ? {
              [P in HavingFields]: P extends ByFields
                ? never
                : P extends string
                  ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
                  : [
                      Error,
                      "Field ",
                      P,
                      ` in "having" needs to be provided in "by"`,
                    ];
            }[HavingFields]
          : "take" extends Keys<T>
            ? "orderBy" extends Keys<T>
              ? ByValid extends True
                ? {}
                : {
                    [P in OrderFields]: P extends ByFields
                      ? never
                      : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`;
                  }[OrderFields]
              : 'Error: If you provide "take", you also need to provide "orderBy"'
            : "skip" extends Keys<T>
              ? "orderBy" extends Keys<T>
                ? ByValid extends True
                  ? {}
                  : {
                      [P in OrderFields]: P extends ByFields
                        ? never
                        : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`;
                    }[OrderFields]
                : 'Error: If you provide "skip", you also need to provide "orderBy"'
              : ByValid extends True
                ? {}
                : {
                    [P in OrderFields]: P extends ByFields
                      ? never
                      : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`;
                  }[OrderFields],
    >(
      args: SubsetIntersection<T, DriveDocumentGroupByArgs, OrderByArg> &
        InputErrors,
    ): {} extends InputErrors
      ? GetDriveDocumentGroupByPayload<T>
      : Prisma.PrismaPromise<InputErrors>;
    /**
     * Fields of the DriveDocument model
     */
    readonly fields: DriveDocumentFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for DriveDocument.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__DriveDocumentClient<
    T,
    Null = never,
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise";
    drive<T extends DriveDefaultArgs<ExtArgs> = {}>(
      args?: Subset<T, DriveDefaultArgs<ExtArgs>>,
    ): Prisma__DriveClient<
      | $Result.GetResult<Prisma.$DrivePayload<ExtArgs>, T, "findUniqueOrThrow">
      | Null,
      Null,
      ExtArgs
    >;
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(
      onfulfilled?:
        | ((value: T) => TResult1 | PromiseLike<TResult1>)
        | undefined
        | null,
      onrejected?:
        | ((reason: any) => TResult2 | PromiseLike<TResult2>)
        | undefined
        | null,
    ): $Utils.JsPromise<TResult1 | TResult2>;
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(
      onrejected?:
        | ((reason: any) => TResult | PromiseLike<TResult>)
        | undefined
        | null,
    ): $Utils.JsPromise<T | TResult>;
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>;
  }

  /**
   * Fields of the DriveDocument model
   */
  interface DriveDocumentFieldRefs {
    readonly driveId: FieldRef<"DriveDocument", "String">;
    readonly documentId: FieldRef<"DriveDocument", "String">;
  }

  // Custom InputTypes
  /**
   * DriveDocument findUnique
   */
  export type DriveDocumentFindUniqueArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * Select specific fields to fetch from the DriveDocument
     */
    select?: DriveDocumentSelect<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: DriveDocumentInclude<ExtArgs> | null;
    /**
     * Filter, which DriveDocument to fetch.
     */
    where: DriveDocumentWhereUniqueInput;
  };

  /**
   * DriveDocument findUniqueOrThrow
   */
  export type DriveDocumentFindUniqueOrThrowArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * Select specific fields to fetch from the DriveDocument
     */
    select?: DriveDocumentSelect<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: DriveDocumentInclude<ExtArgs> | null;
    /**
     * Filter, which DriveDocument to fetch.
     */
    where: DriveDocumentWhereUniqueInput;
  };

  /**
   * DriveDocument findFirst
   */
  export type DriveDocumentFindFirstArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * Select specific fields to fetch from the DriveDocument
     */
    select?: DriveDocumentSelect<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: DriveDocumentInclude<ExtArgs> | null;
    /**
     * Filter, which DriveDocument to fetch.
     */
    where?: DriveDocumentWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of DriveDocuments to fetch.
     */
    orderBy?:
      | DriveDocumentOrderByWithRelationInput
      | DriveDocumentOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the position for searching for DriveDocuments.
     */
    cursor?: DriveDocumentWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` DriveDocuments from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` DriveDocuments.
     */
    skip?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     *
     * Filter by unique combinations of DriveDocuments.
     */
    distinct?: DriveDocumentScalarFieldEnum | DriveDocumentScalarFieldEnum[];
  };

  /**
   * DriveDocument findFirstOrThrow
   */
  export type DriveDocumentFindFirstOrThrowArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * Select specific fields to fetch from the DriveDocument
     */
    select?: DriveDocumentSelect<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: DriveDocumentInclude<ExtArgs> | null;
    /**
     * Filter, which DriveDocument to fetch.
     */
    where?: DriveDocumentWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of DriveDocuments to fetch.
     */
    orderBy?:
      | DriveDocumentOrderByWithRelationInput
      | DriveDocumentOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the position for searching for DriveDocuments.
     */
    cursor?: DriveDocumentWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` DriveDocuments from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` DriveDocuments.
     */
    skip?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     *
     * Filter by unique combinations of DriveDocuments.
     */
    distinct?: DriveDocumentScalarFieldEnum | DriveDocumentScalarFieldEnum[];
  };

  /**
   * DriveDocument findMany
   */
  export type DriveDocumentFindManyArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * Select specific fields to fetch from the DriveDocument
     */
    select?: DriveDocumentSelect<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: DriveDocumentInclude<ExtArgs> | null;
    /**
     * Filter, which DriveDocuments to fetch.
     */
    where?: DriveDocumentWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of DriveDocuments to fetch.
     */
    orderBy?:
      | DriveDocumentOrderByWithRelationInput
      | DriveDocumentOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the position for listing DriveDocuments.
     */
    cursor?: DriveDocumentWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` DriveDocuments from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` DriveDocuments.
     */
    skip?: number;
    distinct?: DriveDocumentScalarFieldEnum | DriveDocumentScalarFieldEnum[];
  };

  /**
   * DriveDocument create
   */
  export type DriveDocumentCreateArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * Select specific fields to fetch from the DriveDocument
     */
    select?: DriveDocumentSelect<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: DriveDocumentInclude<ExtArgs> | null;
    /**
     * The data needed to create a DriveDocument.
     */
    data: XOR<DriveDocumentCreateInput, DriveDocumentUncheckedCreateInput>;
  };

  /**
   * DriveDocument createMany
   */
  export type DriveDocumentCreateManyArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * The data used to create many DriveDocuments.
     */
    data: DriveDocumentCreateManyInput | DriveDocumentCreateManyInput[];
    skipDuplicates?: boolean;
  };

  /**
   * DriveDocument createManyAndReturn
   */
  export type DriveDocumentCreateManyAndReturnArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * Select specific fields to fetch from the DriveDocument
     */
    select?: DriveDocumentSelectCreateManyAndReturn<ExtArgs> | null;
    /**
     * The data used to create many DriveDocuments.
     */
    data: DriveDocumentCreateManyInput | DriveDocumentCreateManyInput[];
    skipDuplicates?: boolean;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: DriveDocumentIncludeCreateManyAndReturn<ExtArgs> | null;
  };

  /**
   * DriveDocument update
   */
  export type DriveDocumentUpdateArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * Select specific fields to fetch from the DriveDocument
     */
    select?: DriveDocumentSelect<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: DriveDocumentInclude<ExtArgs> | null;
    /**
     * The data needed to update a DriveDocument.
     */
    data: XOR<DriveDocumentUpdateInput, DriveDocumentUncheckedUpdateInput>;
    /**
     * Choose, which DriveDocument to update.
     */
    where: DriveDocumentWhereUniqueInput;
  };

  /**
   * DriveDocument updateMany
   */
  export type DriveDocumentUpdateManyArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * The data used to update DriveDocuments.
     */
    data: XOR<
      DriveDocumentUpdateManyMutationInput,
      DriveDocumentUncheckedUpdateManyInput
    >;
    /**
     * Filter which DriveDocuments to update
     */
    where?: DriveDocumentWhereInput;
  };

  /**
   * DriveDocument upsert
   */
  export type DriveDocumentUpsertArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * Select specific fields to fetch from the DriveDocument
     */
    select?: DriveDocumentSelect<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: DriveDocumentInclude<ExtArgs> | null;
    /**
     * The filter to search for the DriveDocument to update in case it exists.
     */
    where: DriveDocumentWhereUniqueInput;
    /**
     * In case the DriveDocument found by the `where` argument doesn't exist, create a new DriveDocument with this data.
     */
    create: XOR<DriveDocumentCreateInput, DriveDocumentUncheckedCreateInput>;
    /**
     * In case the DriveDocument was found with the provided `where` argument, update it with this data.
     */
    update: XOR<DriveDocumentUpdateInput, DriveDocumentUncheckedUpdateInput>;
  };

  /**
   * DriveDocument delete
   */
  export type DriveDocumentDeleteArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * Select specific fields to fetch from the DriveDocument
     */
    select?: DriveDocumentSelect<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: DriveDocumentInclude<ExtArgs> | null;
    /**
     * Filter which DriveDocument to delete.
     */
    where: DriveDocumentWhereUniqueInput;
  };

  /**
   * DriveDocument deleteMany
   */
  export type DriveDocumentDeleteManyArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * Filter which DriveDocuments to delete
     */
    where?: DriveDocumentWhereInput;
  };

  /**
   * DriveDocument without action
   */
  export type DriveDocumentDefaultArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * Select specific fields to fetch from the DriveDocument
     */
    select?: DriveDocumentSelect<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: DriveDocumentInclude<ExtArgs> | null;
  };

  /**
   * Model Operation
   */

  export type AggregateOperation = {
    _count: OperationCountAggregateOutputType | null;
    _avg: OperationAvgAggregateOutputType | null;
    _sum: OperationSumAggregateOutputType | null;
    _min: OperationMinAggregateOutputType | null;
    _max: OperationMaxAggregateOutputType | null;
  };

  export type OperationAvgAggregateOutputType = {
    index: number | null;
    skip: number | null;
  };

  export type OperationSumAggregateOutputType = {
    index: number | null;
    skip: number | null;
  };

  export type OperationMinAggregateOutputType = {
    id: string | null;
    opId: string | null;
    documentId: string | null;
    scope: string | null;
    branch: string | null;
    index: number | null;
    skip: number | null;
    hash: string | null;
    timestamp: Date | null;
    actionId: string | null;
    input: string | null;
    type: string | null;
    syncId: string | null;
    clipboard: boolean | null;
    resultingState: Buffer | null;
  };

  export type OperationMaxAggregateOutputType = {
    id: string | null;
    opId: string | null;
    documentId: string | null;
    scope: string | null;
    branch: string | null;
    index: number | null;
    skip: number | null;
    hash: string | null;
    timestamp: Date | null;
    actionId: string | null;
    input: string | null;
    type: string | null;
    syncId: string | null;
    clipboard: boolean | null;
    resultingState: Buffer | null;
  };

  export type OperationCountAggregateOutputType = {
    id: number;
    opId: number;
    documentId: number;
    scope: number;
    branch: number;
    index: number;
    skip: number;
    hash: number;
    timestamp: number;
    actionId: number;
    input: number;
    type: number;
    syncId: number;
    clipboard: number;
    context: number;
    resultingState: number;
    _all: number;
  };

  export type OperationAvgAggregateInputType = {
    index?: true;
    skip?: true;
  };

  export type OperationSumAggregateInputType = {
    index?: true;
    skip?: true;
  };

  export type OperationMinAggregateInputType = {
    id?: true;
    opId?: true;
    documentId?: true;
    scope?: true;
    branch?: true;
    index?: true;
    skip?: true;
    hash?: true;
    timestamp?: true;
    actionId?: true;
    input?: true;
    type?: true;
    syncId?: true;
    clipboard?: true;
    resultingState?: true;
  };

  export type OperationMaxAggregateInputType = {
    id?: true;
    opId?: true;
    documentId?: true;
    scope?: true;
    branch?: true;
    index?: true;
    skip?: true;
    hash?: true;
    timestamp?: true;
    actionId?: true;
    input?: true;
    type?: true;
    syncId?: true;
    clipboard?: true;
    resultingState?: true;
  };

  export type OperationCountAggregateInputType = {
    id?: true;
    opId?: true;
    documentId?: true;
    scope?: true;
    branch?: true;
    index?: true;
    skip?: true;
    hash?: true;
    timestamp?: true;
    actionId?: true;
    input?: true;
    type?: true;
    syncId?: true;
    clipboard?: true;
    context?: true;
    resultingState?: true;
    _all?: true;
  };

  export type OperationAggregateArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * Filter which Operation to aggregate.
     */
    where?: OperationWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of Operations to fetch.
     */
    orderBy?:
      | OperationOrderByWithRelationInput
      | OperationOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the start position
     */
    cursor?: OperationWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` Operations from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` Operations.
     */
    skip?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Count returned Operations
     **/
    _count?: true | OperationCountAggregateInputType;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Select which fields to average
     **/
    _avg?: OperationAvgAggregateInputType;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Select which fields to sum
     **/
    _sum?: OperationSumAggregateInputType;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Select which fields to find the minimum value
     **/
    _min?: OperationMinAggregateInputType;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Select which fields to find the maximum value
     **/
    _max?: OperationMaxAggregateInputType;
  };

  export type GetOperationAggregateType<T extends OperationAggregateArgs> = {
    [P in keyof T & keyof AggregateOperation]: P extends "_count" | "count"
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateOperation[P]>
      : GetScalarType<T[P], AggregateOperation[P]>;
  };

  export type OperationGroupByArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    where?: OperationWhereInput;
    orderBy?:
      | OperationOrderByWithAggregationInput
      | OperationOrderByWithAggregationInput[];
    by: OperationScalarFieldEnum[] | OperationScalarFieldEnum;
    having?: OperationScalarWhereWithAggregatesInput;
    take?: number;
    skip?: number;
    _count?: OperationCountAggregateInputType | true;
    _avg?: OperationAvgAggregateInputType;
    _sum?: OperationSumAggregateInputType;
    _min?: OperationMinAggregateInputType;
    _max?: OperationMaxAggregateInputType;
  };

  export type OperationGroupByOutputType = {
    id: string;
    opId: string | null;
    documentId: string;
    scope: string;
    branch: string;
    index: number;
    skip: number;
    hash: string;
    timestamp: Date;
    actionId: string;
    input: string;
    type: string;
    syncId: string | null;
    clipboard: boolean | null;
    context: JsonValue | null;
    resultingState: Buffer | null;
    _count: OperationCountAggregateOutputType | null;
    _avg: OperationAvgAggregateOutputType | null;
    _sum: OperationSumAggregateOutputType | null;
    _min: OperationMinAggregateOutputType | null;
    _max: OperationMaxAggregateOutputType | null;
  };

  type GetOperationGroupByPayload<T extends OperationGroupByArgs> =
    Prisma.PrismaPromise<
      Array<
        PickEnumerable<OperationGroupByOutputType, T["by"]> & {
          [P in keyof T & keyof OperationGroupByOutputType]: P extends "_count"
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], OperationGroupByOutputType[P]>
            : GetScalarType<T[P], OperationGroupByOutputType[P]>;
        }
      >
    >;

  export type OperationSelect<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = $Extensions.GetSelect<
    {
      id?: boolean;
      opId?: boolean;
      documentId?: boolean;
      scope?: boolean;
      branch?: boolean;
      index?: boolean;
      skip?: boolean;
      hash?: boolean;
      timestamp?: boolean;
      actionId?: boolean;
      input?: boolean;
      type?: boolean;
      syncId?: boolean;
      clipboard?: boolean;
      context?: boolean;
      resultingState?: boolean;
      Document?: boolean | Operation$DocumentArgs<ExtArgs>;
      attachments?: boolean | Operation$attachmentsArgs<ExtArgs>;
      SynchronizationUnit?:
        | boolean
        | Operation$SynchronizationUnitArgs<ExtArgs>;
      _count?: boolean | OperationCountOutputTypeDefaultArgs<ExtArgs>;
    },
    ExtArgs["result"]["operation"]
  >;

  export type OperationSelectCreateManyAndReturn<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = $Extensions.GetSelect<
    {
      id?: boolean;
      opId?: boolean;
      documentId?: boolean;
      scope?: boolean;
      branch?: boolean;
      index?: boolean;
      skip?: boolean;
      hash?: boolean;
      timestamp?: boolean;
      actionId?: boolean;
      input?: boolean;
      type?: boolean;
      syncId?: boolean;
      clipboard?: boolean;
      context?: boolean;
      resultingState?: boolean;
      Document?: boolean | Operation$DocumentArgs<ExtArgs>;
      SynchronizationUnit?:
        | boolean
        | Operation$SynchronizationUnitArgs<ExtArgs>;
    },
    ExtArgs["result"]["operation"]
  >;

  export type OperationSelectScalar = {
    id?: boolean;
    opId?: boolean;
    documentId?: boolean;
    scope?: boolean;
    branch?: boolean;
    index?: boolean;
    skip?: boolean;
    hash?: boolean;
    timestamp?: boolean;
    actionId?: boolean;
    input?: boolean;
    type?: boolean;
    syncId?: boolean;
    clipboard?: boolean;
    context?: boolean;
    resultingState?: boolean;
  };

  export type OperationInclude<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    Document?: boolean | Operation$DocumentArgs<ExtArgs>;
    attachments?: boolean | Operation$attachmentsArgs<ExtArgs>;
    SynchronizationUnit?: boolean | Operation$SynchronizationUnitArgs<ExtArgs>;
    _count?: boolean | OperationCountOutputTypeDefaultArgs<ExtArgs>;
  };
  export type OperationIncludeCreateManyAndReturn<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    Document?: boolean | Operation$DocumentArgs<ExtArgs>;
    SynchronizationUnit?: boolean | Operation$SynchronizationUnitArgs<ExtArgs>;
  };

  export type $OperationPayload<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    name: "Operation";
    objects: {
      Document: Prisma.$DocumentPayload<ExtArgs> | null;
      attachments: Prisma.$AttachmentPayload<ExtArgs>[];
      SynchronizationUnit: Prisma.$SynchronizationUnitPayload<ExtArgs> | null;
    };
    scalars: $Extensions.GetPayloadResult<
      {
        id: string;
        opId: string | null;
        documentId: string;
        scope: string;
        branch: string;
        index: number;
        skip: number;
        hash: string;
        timestamp: Date;
        actionId: string;
        input: string;
        type: string;
        syncId: string | null;
        clipboard: boolean | null;
        context: Prisma.JsonValue | null;
        resultingState: Buffer | null;
      },
      ExtArgs["result"]["operation"]
    >;
    composites: {};
  };

  type OperationGetPayload<
    S extends boolean | null | undefined | OperationDefaultArgs,
  > = $Result.GetResult<Prisma.$OperationPayload, S>;

  type OperationCountArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = Omit<OperationFindManyArgs, "select" | "include" | "distinct"> & {
    select?: OperationCountAggregateInputType | true;
  };

  export interface OperationDelegate<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > {
    [K: symbol]: {
      types: Prisma.TypeMap<ExtArgs>["model"]["Operation"];
      meta: { name: "Operation" };
    };
    /**
     * Find zero or one Operation that matches the filter.
     * @param {OperationFindUniqueArgs} args - Arguments to find a Operation
     * @example
     * // Get one Operation
     * const operation = await prisma.operation.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends OperationFindUniqueArgs>(
      args: SelectSubset<T, OperationFindUniqueArgs<ExtArgs>>,
    ): Prisma__OperationClient<
      $Result.GetResult<
        Prisma.$OperationPayload<ExtArgs>,
        T,
        "findUnique"
      > | null,
      null,
      ExtArgs
    >;

    /**
     * Find one Operation that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {OperationFindUniqueOrThrowArgs} args - Arguments to find a Operation
     * @example
     * // Get one Operation
     * const operation = await prisma.operation.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends OperationFindUniqueOrThrowArgs>(
      args: SelectSubset<T, OperationFindUniqueOrThrowArgs<ExtArgs>>,
    ): Prisma__OperationClient<
      $Result.GetResult<
        Prisma.$OperationPayload<ExtArgs>,
        T,
        "findUniqueOrThrow"
      >,
      never,
      ExtArgs
    >;

    /**
     * Find the first Operation that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {OperationFindFirstArgs} args - Arguments to find a Operation
     * @example
     * // Get one Operation
     * const operation = await prisma.operation.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends OperationFindFirstArgs>(
      args?: SelectSubset<T, OperationFindFirstArgs<ExtArgs>>,
    ): Prisma__OperationClient<
      $Result.GetResult<
        Prisma.$OperationPayload<ExtArgs>,
        T,
        "findFirst"
      > | null,
      null,
      ExtArgs
    >;

    /**
     * Find the first Operation that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {OperationFindFirstOrThrowArgs} args - Arguments to find a Operation
     * @example
     * // Get one Operation
     * const operation = await prisma.operation.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends OperationFindFirstOrThrowArgs>(
      args?: SelectSubset<T, OperationFindFirstOrThrowArgs<ExtArgs>>,
    ): Prisma__OperationClient<
      $Result.GetResult<
        Prisma.$OperationPayload<ExtArgs>,
        T,
        "findFirstOrThrow"
      >,
      never,
      ExtArgs
    >;

    /**
     * Find zero or more Operations that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {OperationFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all Operations
     * const operations = await prisma.operation.findMany()
     *
     * // Get first 10 Operations
     * const operations = await prisma.operation.findMany({ take: 10 })
     *
     * // Only select the `id`
     * const operationWithIdOnly = await prisma.operation.findMany({ select: { id: true } })
     *
     */
    findMany<T extends OperationFindManyArgs>(
      args?: SelectSubset<T, OperationFindManyArgs<ExtArgs>>,
    ): Prisma.PrismaPromise<
      $Result.GetResult<Prisma.$OperationPayload<ExtArgs>, T, "findMany">
    >;

    /**
     * Create a Operation.
     * @param {OperationCreateArgs} args - Arguments to create a Operation.
     * @example
     * // Create one Operation
     * const Operation = await prisma.operation.create({
     *   data: {
     *     // ... data to create a Operation
     *   }
     * })
     *
     */
    create<T extends OperationCreateArgs>(
      args: SelectSubset<T, OperationCreateArgs<ExtArgs>>,
    ): Prisma__OperationClient<
      $Result.GetResult<Prisma.$OperationPayload<ExtArgs>, T, "create">,
      never,
      ExtArgs
    >;

    /**
     * Create many Operations.
     * @param {OperationCreateManyArgs} args - Arguments to create many Operations.
     * @example
     * // Create many Operations
     * const operation = await prisma.operation.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *
     */
    createMany<T extends OperationCreateManyArgs>(
      args?: SelectSubset<T, OperationCreateManyArgs<ExtArgs>>,
    ): Prisma.PrismaPromise<BatchPayload>;

    /**
     * Create many Operations and returns the data saved in the database.
     * @param {OperationCreateManyAndReturnArgs} args - Arguments to create many Operations.
     * @example
     * // Create many Operations
     * const operation = await prisma.operation.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *
     * // Create many Operations and only return the `id`
     * const operationWithIdOnly = await prisma.operation.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     *
     */
    createManyAndReturn<T extends OperationCreateManyAndReturnArgs>(
      args?: SelectSubset<T, OperationCreateManyAndReturnArgs<ExtArgs>>,
    ): Prisma.PrismaPromise<
      $Result.GetResult<
        Prisma.$OperationPayload<ExtArgs>,
        T,
        "createManyAndReturn"
      >
    >;

    /**
     * Delete a Operation.
     * @param {OperationDeleteArgs} args - Arguments to delete one Operation.
     * @example
     * // Delete one Operation
     * const Operation = await prisma.operation.delete({
     *   where: {
     *     // ... filter to delete one Operation
     *   }
     * })
     *
     */
    delete<T extends OperationDeleteArgs>(
      args: SelectSubset<T, OperationDeleteArgs<ExtArgs>>,
    ): Prisma__OperationClient<
      $Result.GetResult<Prisma.$OperationPayload<ExtArgs>, T, "delete">,
      never,
      ExtArgs
    >;

    /**
     * Update one Operation.
     * @param {OperationUpdateArgs} args - Arguments to update one Operation.
     * @example
     * // Update one Operation
     * const operation = await prisma.operation.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     *
     */
    update<T extends OperationUpdateArgs>(
      args: SelectSubset<T, OperationUpdateArgs<ExtArgs>>,
    ): Prisma__OperationClient<
      $Result.GetResult<Prisma.$OperationPayload<ExtArgs>, T, "update">,
      never,
      ExtArgs
    >;

    /**
     * Delete zero or more Operations.
     * @param {OperationDeleteManyArgs} args - Arguments to filter Operations to delete.
     * @example
     * // Delete a few Operations
     * const { count } = await prisma.operation.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     *
     */
    deleteMany<T extends OperationDeleteManyArgs>(
      args?: SelectSubset<T, OperationDeleteManyArgs<ExtArgs>>,
    ): Prisma.PrismaPromise<BatchPayload>;

    /**
     * Update zero or more Operations.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {OperationUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many Operations
     * const operation = await prisma.operation.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     *
     */
    updateMany<T extends OperationUpdateManyArgs>(
      args: SelectSubset<T, OperationUpdateManyArgs<ExtArgs>>,
    ): Prisma.PrismaPromise<BatchPayload>;

    /**
     * Create or update one Operation.
     * @param {OperationUpsertArgs} args - Arguments to update or create a Operation.
     * @example
     * // Update or create a Operation
     * const operation = await prisma.operation.upsert({
     *   create: {
     *     // ... data to create a Operation
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the Operation we want to update
     *   }
     * })
     */
    upsert<T extends OperationUpsertArgs>(
      args: SelectSubset<T, OperationUpsertArgs<ExtArgs>>,
    ): Prisma__OperationClient<
      $Result.GetResult<Prisma.$OperationPayload<ExtArgs>, T, "upsert">,
      never,
      ExtArgs
    >;

    /**
     * Count the number of Operations.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {OperationCountArgs} args - Arguments to filter Operations to count.
     * @example
     * // Count the number of Operations
     * const count = await prisma.operation.count({
     *   where: {
     *     // ... the filter for the Operations we want to count
     *   }
     * })
     **/
    count<T extends OperationCountArgs>(
      args?: Subset<T, OperationCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<"select", any>
        ? T["select"] extends true
          ? number
          : GetScalarType<T["select"], OperationCountAggregateOutputType>
        : number
    >;

    /**
     * Allows you to perform aggregations operations on a Operation.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {OperationAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
     **/
    aggregate<T extends OperationAggregateArgs>(
      args: Subset<T, OperationAggregateArgs>,
    ): Prisma.PrismaPromise<GetOperationAggregateType<T>>;

    /**
     * Group by Operation.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {OperationGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     *
     **/
    groupBy<
      T extends OperationGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<"skip", Keys<T>>,
        Extends<"take", Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: OperationGroupByArgs["orderBy"] }
        : { orderBy?: OperationGroupByArgs["orderBy"] },
      OrderFields extends ExcludeUnderscoreKeys<
        Keys<MaybeTupleToUnion<T["orderBy"]>>
      >,
      ByFields extends MaybeTupleToUnion<T["by"]>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T["having"]>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T["by"] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
        ? `Error: "by" must not be empty.`
        : HavingValid extends False
          ? {
              [P in HavingFields]: P extends ByFields
                ? never
                : P extends string
                  ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
                  : [
                      Error,
                      "Field ",
                      P,
                      ` in "having" needs to be provided in "by"`,
                    ];
            }[HavingFields]
          : "take" extends Keys<T>
            ? "orderBy" extends Keys<T>
              ? ByValid extends True
                ? {}
                : {
                    [P in OrderFields]: P extends ByFields
                      ? never
                      : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`;
                  }[OrderFields]
              : 'Error: If you provide "take", you also need to provide "orderBy"'
            : "skip" extends Keys<T>
              ? "orderBy" extends Keys<T>
                ? ByValid extends True
                  ? {}
                  : {
                      [P in OrderFields]: P extends ByFields
                        ? never
                        : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`;
                    }[OrderFields]
                : 'Error: If you provide "skip", you also need to provide "orderBy"'
              : ByValid extends True
                ? {}
                : {
                    [P in OrderFields]: P extends ByFields
                      ? never
                      : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`;
                  }[OrderFields],
    >(
      args: SubsetIntersection<T, OperationGroupByArgs, OrderByArg> &
        InputErrors,
    ): {} extends InputErrors
      ? GetOperationGroupByPayload<T>
      : Prisma.PrismaPromise<InputErrors>;
    /**
     * Fields of the Operation model
     */
    readonly fields: OperationFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for Operation.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__OperationClient<
    T,
    Null = never,
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise";
    Document<T extends Operation$DocumentArgs<ExtArgs> = {}>(
      args?: Subset<T, Operation$DocumentArgs<ExtArgs>>,
    ): Prisma__DocumentClient<
      $Result.GetResult<
        Prisma.$DocumentPayload<ExtArgs>,
        T,
        "findUniqueOrThrow"
      > | null,
      null,
      ExtArgs
    >;
    attachments<T extends Operation$attachmentsArgs<ExtArgs> = {}>(
      args?: Subset<T, Operation$attachmentsArgs<ExtArgs>>,
    ): Prisma.PrismaPromise<
      | $Result.GetResult<Prisma.$AttachmentPayload<ExtArgs>, T, "findMany">
      | Null
    >;
    SynchronizationUnit<
      T extends Operation$SynchronizationUnitArgs<ExtArgs> = {},
    >(
      args?: Subset<T, Operation$SynchronizationUnitArgs<ExtArgs>>,
    ): Prisma__SynchronizationUnitClient<
      $Result.GetResult<
        Prisma.$SynchronizationUnitPayload<ExtArgs>,
        T,
        "findUniqueOrThrow"
      > | null,
      null,
      ExtArgs
    >;
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(
      onfulfilled?:
        | ((value: T) => TResult1 | PromiseLike<TResult1>)
        | undefined
        | null,
      onrejected?:
        | ((reason: any) => TResult2 | PromiseLike<TResult2>)
        | undefined
        | null,
    ): $Utils.JsPromise<TResult1 | TResult2>;
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(
      onrejected?:
        | ((reason: any) => TResult | PromiseLike<TResult>)
        | undefined
        | null,
    ): $Utils.JsPromise<T | TResult>;
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>;
  }

  /**
   * Fields of the Operation model
   */
  interface OperationFieldRefs {
    readonly id: FieldRef<"Operation", "String">;
    readonly opId: FieldRef<"Operation", "String">;
    readonly documentId: FieldRef<"Operation", "String">;
    readonly scope: FieldRef<"Operation", "String">;
    readonly branch: FieldRef<"Operation", "String">;
    readonly index: FieldRef<"Operation", "Int">;
    readonly skip: FieldRef<"Operation", "Int">;
    readonly hash: FieldRef<"Operation", "String">;
    readonly timestamp: FieldRef<"Operation", "DateTime">;
    readonly actionId: FieldRef<"Operation", "String">;
    readonly input: FieldRef<"Operation", "String">;
    readonly type: FieldRef<"Operation", "String">;
    readonly syncId: FieldRef<"Operation", "String">;
    readonly clipboard: FieldRef<"Operation", "Boolean">;
    readonly context: FieldRef<"Operation", "Json">;
    readonly resultingState: FieldRef<"Operation", "Bytes">;
  }

  // Custom InputTypes
  /**
   * Operation findUnique
   */
  export type OperationFindUniqueArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * Select specific fields to fetch from the Operation
     */
    select?: OperationSelect<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: OperationInclude<ExtArgs> | null;
    /**
     * Filter, which Operation to fetch.
     */
    where: OperationWhereUniqueInput;
  };

  /**
   * Operation findUniqueOrThrow
   */
  export type OperationFindUniqueOrThrowArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * Select specific fields to fetch from the Operation
     */
    select?: OperationSelect<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: OperationInclude<ExtArgs> | null;
    /**
     * Filter, which Operation to fetch.
     */
    where: OperationWhereUniqueInput;
  };

  /**
   * Operation findFirst
   */
  export type OperationFindFirstArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * Select specific fields to fetch from the Operation
     */
    select?: OperationSelect<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: OperationInclude<ExtArgs> | null;
    /**
     * Filter, which Operation to fetch.
     */
    where?: OperationWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of Operations to fetch.
     */
    orderBy?:
      | OperationOrderByWithRelationInput
      | OperationOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the position for searching for Operations.
     */
    cursor?: OperationWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` Operations from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` Operations.
     */
    skip?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     *
     * Filter by unique combinations of Operations.
     */
    distinct?: OperationScalarFieldEnum | OperationScalarFieldEnum[];
  };

  /**
   * Operation findFirstOrThrow
   */
  export type OperationFindFirstOrThrowArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * Select specific fields to fetch from the Operation
     */
    select?: OperationSelect<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: OperationInclude<ExtArgs> | null;
    /**
     * Filter, which Operation to fetch.
     */
    where?: OperationWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of Operations to fetch.
     */
    orderBy?:
      | OperationOrderByWithRelationInput
      | OperationOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the position for searching for Operations.
     */
    cursor?: OperationWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` Operations from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` Operations.
     */
    skip?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     *
     * Filter by unique combinations of Operations.
     */
    distinct?: OperationScalarFieldEnum | OperationScalarFieldEnum[];
  };

  /**
   * Operation findMany
   */
  export type OperationFindManyArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * Select specific fields to fetch from the Operation
     */
    select?: OperationSelect<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: OperationInclude<ExtArgs> | null;
    /**
     * Filter, which Operations to fetch.
     */
    where?: OperationWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of Operations to fetch.
     */
    orderBy?:
      | OperationOrderByWithRelationInput
      | OperationOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the position for listing Operations.
     */
    cursor?: OperationWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` Operations from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` Operations.
     */
    skip?: number;
    distinct?: OperationScalarFieldEnum | OperationScalarFieldEnum[];
  };

  /**
   * Operation create
   */
  export type OperationCreateArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * Select specific fields to fetch from the Operation
     */
    select?: OperationSelect<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: OperationInclude<ExtArgs> | null;
    /**
     * The data needed to create a Operation.
     */
    data: XOR<OperationCreateInput, OperationUncheckedCreateInput>;
  };

  /**
   * Operation createMany
   */
  export type OperationCreateManyArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * The data used to create many Operations.
     */
    data: OperationCreateManyInput | OperationCreateManyInput[];
    skipDuplicates?: boolean;
  };

  /**
   * Operation createManyAndReturn
   */
  export type OperationCreateManyAndReturnArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * Select specific fields to fetch from the Operation
     */
    select?: OperationSelectCreateManyAndReturn<ExtArgs> | null;
    /**
     * The data used to create many Operations.
     */
    data: OperationCreateManyInput | OperationCreateManyInput[];
    skipDuplicates?: boolean;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: OperationIncludeCreateManyAndReturn<ExtArgs> | null;
  };

  /**
   * Operation update
   */
  export type OperationUpdateArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * Select specific fields to fetch from the Operation
     */
    select?: OperationSelect<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: OperationInclude<ExtArgs> | null;
    /**
     * The data needed to update a Operation.
     */
    data: XOR<OperationUpdateInput, OperationUncheckedUpdateInput>;
    /**
     * Choose, which Operation to update.
     */
    where: OperationWhereUniqueInput;
  };

  /**
   * Operation updateMany
   */
  export type OperationUpdateManyArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * The data used to update Operations.
     */
    data: XOR<
      OperationUpdateManyMutationInput,
      OperationUncheckedUpdateManyInput
    >;
    /**
     * Filter which Operations to update
     */
    where?: OperationWhereInput;
  };

  /**
   * Operation upsert
   */
  export type OperationUpsertArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * Select specific fields to fetch from the Operation
     */
    select?: OperationSelect<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: OperationInclude<ExtArgs> | null;
    /**
     * The filter to search for the Operation to update in case it exists.
     */
    where: OperationWhereUniqueInput;
    /**
     * In case the Operation found by the `where` argument doesn't exist, create a new Operation with this data.
     */
    create: XOR<OperationCreateInput, OperationUncheckedCreateInput>;
    /**
     * In case the Operation was found with the provided `where` argument, update it with this data.
     */
    update: XOR<OperationUpdateInput, OperationUncheckedUpdateInput>;
  };

  /**
   * Operation delete
   */
  export type OperationDeleteArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * Select specific fields to fetch from the Operation
     */
    select?: OperationSelect<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: OperationInclude<ExtArgs> | null;
    /**
     * Filter which Operation to delete.
     */
    where: OperationWhereUniqueInput;
  };

  /**
   * Operation deleteMany
   */
  export type OperationDeleteManyArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * Filter which Operations to delete
     */
    where?: OperationWhereInput;
  };

  /**
   * Operation.Document
   */
  export type Operation$DocumentArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * Select specific fields to fetch from the Document
     */
    select?: DocumentSelect<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: DocumentInclude<ExtArgs> | null;
    where?: DocumentWhereInput;
  };

  /**
   * Operation.attachments
   */
  export type Operation$attachmentsArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * Select specific fields to fetch from the Attachment
     */
    select?: AttachmentSelect<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: AttachmentInclude<ExtArgs> | null;
    where?: AttachmentWhereInput;
    orderBy?:
      | AttachmentOrderByWithRelationInput
      | AttachmentOrderByWithRelationInput[];
    cursor?: AttachmentWhereUniqueInput;
    take?: number;
    skip?: number;
    distinct?: AttachmentScalarFieldEnum | AttachmentScalarFieldEnum[];
  };

  /**
   * Operation.SynchronizationUnit
   */
  export type Operation$SynchronizationUnitArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * Select specific fields to fetch from the SynchronizationUnit
     */
    select?: SynchronizationUnitSelect<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SynchronizationUnitInclude<ExtArgs> | null;
    where?: SynchronizationUnitWhereInput;
  };

  /**
   * Operation without action
   */
  export type OperationDefaultArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * Select specific fields to fetch from the Operation
     */
    select?: OperationSelect<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: OperationInclude<ExtArgs> | null;
  };

  /**
   * Model SynchronizationUnit
   */

  export type AggregateSynchronizationUnit = {
    _count: SynchronizationUnitCountAggregateOutputType | null;
    _min: SynchronizationUnitMinAggregateOutputType | null;
    _max: SynchronizationUnitMaxAggregateOutputType | null;
  };

  export type SynchronizationUnitMinAggregateOutputType = {
    id: string | null;
    documentId: string | null;
    scope: string | null;
    branch: string | null;
  };

  export type SynchronizationUnitMaxAggregateOutputType = {
    id: string | null;
    documentId: string | null;
    scope: string | null;
    branch: string | null;
  };

  export type SynchronizationUnitCountAggregateOutputType = {
    id: number;
    documentId: number;
    scope: number;
    branch: number;
    _all: number;
  };

  export type SynchronizationUnitMinAggregateInputType = {
    id?: true;
    documentId?: true;
    scope?: true;
    branch?: true;
  };

  export type SynchronizationUnitMaxAggregateInputType = {
    id?: true;
    documentId?: true;
    scope?: true;
    branch?: true;
  };

  export type SynchronizationUnitCountAggregateInputType = {
    id?: true;
    documentId?: true;
    scope?: true;
    branch?: true;
    _all?: true;
  };

  export type SynchronizationUnitAggregateArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * Filter which SynchronizationUnit to aggregate.
     */
    where?: SynchronizationUnitWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of SynchronizationUnits to fetch.
     */
    orderBy?:
      | SynchronizationUnitOrderByWithRelationInput
      | SynchronizationUnitOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the start position
     */
    cursor?: SynchronizationUnitWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` SynchronizationUnits from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` SynchronizationUnits.
     */
    skip?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Count returned SynchronizationUnits
     **/
    _count?: true | SynchronizationUnitCountAggregateInputType;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Select which fields to find the minimum value
     **/
    _min?: SynchronizationUnitMinAggregateInputType;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Select which fields to find the maximum value
     **/
    _max?: SynchronizationUnitMaxAggregateInputType;
  };

  export type GetSynchronizationUnitAggregateType<
    T extends SynchronizationUnitAggregateArgs,
  > = {
    [P in keyof T & keyof AggregateSynchronizationUnit]: P extends
      | "_count"
      | "count"
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateSynchronizationUnit[P]>
      : GetScalarType<T[P], AggregateSynchronizationUnit[P]>;
  };

  export type SynchronizationUnitGroupByArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    where?: SynchronizationUnitWhereInput;
    orderBy?:
      | SynchronizationUnitOrderByWithAggregationInput
      | SynchronizationUnitOrderByWithAggregationInput[];
    by:
      | SynchronizationUnitScalarFieldEnum[]
      | SynchronizationUnitScalarFieldEnum;
    having?: SynchronizationUnitScalarWhereWithAggregatesInput;
    take?: number;
    skip?: number;
    _count?: SynchronizationUnitCountAggregateInputType | true;
    _min?: SynchronizationUnitMinAggregateInputType;
    _max?: SynchronizationUnitMaxAggregateInputType;
  };

  export type SynchronizationUnitGroupByOutputType = {
    id: string;
    documentId: string;
    scope: string;
    branch: string;
    _count: SynchronizationUnitCountAggregateOutputType | null;
    _min: SynchronizationUnitMinAggregateOutputType | null;
    _max: SynchronizationUnitMaxAggregateOutputType | null;
  };

  type GetSynchronizationUnitGroupByPayload<
    T extends SynchronizationUnitGroupByArgs,
  > = Prisma.PrismaPromise<
    Array<
      PickEnumerable<SynchronizationUnitGroupByOutputType, T["by"]> & {
        [P in keyof T &
          keyof SynchronizationUnitGroupByOutputType]: P extends "_count"
          ? T[P] extends boolean
            ? number
            : GetScalarType<T[P], SynchronizationUnitGroupByOutputType[P]>
          : GetScalarType<T[P], SynchronizationUnitGroupByOutputType[P]>;
      }
    >
  >;

  export type SynchronizationUnitSelect<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = $Extensions.GetSelect<
    {
      id?: boolean;
      documentId?: boolean;
      scope?: boolean;
      branch?: boolean;
      Document?: boolean | DocumentDefaultArgs<ExtArgs>;
      operations?: boolean | SynchronizationUnit$operationsArgs<ExtArgs>;
      _count?: boolean | SynchronizationUnitCountOutputTypeDefaultArgs<ExtArgs>;
    },
    ExtArgs["result"]["synchronizationUnit"]
  >;

  export type SynchronizationUnitSelectCreateManyAndReturn<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = $Extensions.GetSelect<
    {
      id?: boolean;
      documentId?: boolean;
      scope?: boolean;
      branch?: boolean;
      Document?: boolean | DocumentDefaultArgs<ExtArgs>;
    },
    ExtArgs["result"]["synchronizationUnit"]
  >;

  export type SynchronizationUnitSelectScalar = {
    id?: boolean;
    documentId?: boolean;
    scope?: boolean;
    branch?: boolean;
  };

  export type SynchronizationUnitInclude<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    Document?: boolean | DocumentDefaultArgs<ExtArgs>;
    operations?: boolean | SynchronizationUnit$operationsArgs<ExtArgs>;
    _count?: boolean | SynchronizationUnitCountOutputTypeDefaultArgs<ExtArgs>;
  };
  export type SynchronizationUnitIncludeCreateManyAndReturn<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    Document?: boolean | DocumentDefaultArgs<ExtArgs>;
  };

  export type $SynchronizationUnitPayload<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    name: "SynchronizationUnit";
    objects: {
      Document: Prisma.$DocumentPayload<ExtArgs>;
      operations: Prisma.$OperationPayload<ExtArgs>[];
    };
    scalars: $Extensions.GetPayloadResult<
      {
        id: string;
        documentId: string;
        scope: string;
        branch: string;
      },
      ExtArgs["result"]["synchronizationUnit"]
    >;
    composites: {};
  };

  type SynchronizationUnitGetPayload<
    S extends boolean | null | undefined | SynchronizationUnitDefaultArgs,
  > = $Result.GetResult<Prisma.$SynchronizationUnitPayload, S>;

  type SynchronizationUnitCountArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = Omit<
    SynchronizationUnitFindManyArgs,
    "select" | "include" | "distinct"
  > & {
    select?: SynchronizationUnitCountAggregateInputType | true;
  };

  export interface SynchronizationUnitDelegate<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > {
    [K: symbol]: {
      types: Prisma.TypeMap<ExtArgs>["model"]["SynchronizationUnit"];
      meta: { name: "SynchronizationUnit" };
    };
    /**
     * Find zero or one SynchronizationUnit that matches the filter.
     * @param {SynchronizationUnitFindUniqueArgs} args - Arguments to find a SynchronizationUnit
     * @example
     * // Get one SynchronizationUnit
     * const synchronizationUnit = await prisma.synchronizationUnit.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends SynchronizationUnitFindUniqueArgs>(
      args: SelectSubset<T, SynchronizationUnitFindUniqueArgs<ExtArgs>>,
    ): Prisma__SynchronizationUnitClient<
      $Result.GetResult<
        Prisma.$SynchronizationUnitPayload<ExtArgs>,
        T,
        "findUnique"
      > | null,
      null,
      ExtArgs
    >;

    /**
     * Find one SynchronizationUnit that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {SynchronizationUnitFindUniqueOrThrowArgs} args - Arguments to find a SynchronizationUnit
     * @example
     * // Get one SynchronizationUnit
     * const synchronizationUnit = await prisma.synchronizationUnit.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends SynchronizationUnitFindUniqueOrThrowArgs>(
      args: SelectSubset<T, SynchronizationUnitFindUniqueOrThrowArgs<ExtArgs>>,
    ): Prisma__SynchronizationUnitClient<
      $Result.GetResult<
        Prisma.$SynchronizationUnitPayload<ExtArgs>,
        T,
        "findUniqueOrThrow"
      >,
      never,
      ExtArgs
    >;

    /**
     * Find the first SynchronizationUnit that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SynchronizationUnitFindFirstArgs} args - Arguments to find a SynchronizationUnit
     * @example
     * // Get one SynchronizationUnit
     * const synchronizationUnit = await prisma.synchronizationUnit.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends SynchronizationUnitFindFirstArgs>(
      args?: SelectSubset<T, SynchronizationUnitFindFirstArgs<ExtArgs>>,
    ): Prisma__SynchronizationUnitClient<
      $Result.GetResult<
        Prisma.$SynchronizationUnitPayload<ExtArgs>,
        T,
        "findFirst"
      > | null,
      null,
      ExtArgs
    >;

    /**
     * Find the first SynchronizationUnit that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SynchronizationUnitFindFirstOrThrowArgs} args - Arguments to find a SynchronizationUnit
     * @example
     * // Get one SynchronizationUnit
     * const synchronizationUnit = await prisma.synchronizationUnit.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends SynchronizationUnitFindFirstOrThrowArgs>(
      args?: SelectSubset<T, SynchronizationUnitFindFirstOrThrowArgs<ExtArgs>>,
    ): Prisma__SynchronizationUnitClient<
      $Result.GetResult<
        Prisma.$SynchronizationUnitPayload<ExtArgs>,
        T,
        "findFirstOrThrow"
      >,
      never,
      ExtArgs
    >;

    /**
     * Find zero or more SynchronizationUnits that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SynchronizationUnitFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all SynchronizationUnits
     * const synchronizationUnits = await prisma.synchronizationUnit.findMany()
     *
     * // Get first 10 SynchronizationUnits
     * const synchronizationUnits = await prisma.synchronizationUnit.findMany({ take: 10 })
     *
     * // Only select the `id`
     * const synchronizationUnitWithIdOnly = await prisma.synchronizationUnit.findMany({ select: { id: true } })
     *
     */
    findMany<T extends SynchronizationUnitFindManyArgs>(
      args?: SelectSubset<T, SynchronizationUnitFindManyArgs<ExtArgs>>,
    ): Prisma.PrismaPromise<
      $Result.GetResult<
        Prisma.$SynchronizationUnitPayload<ExtArgs>,
        T,
        "findMany"
      >
    >;

    /**
     * Create a SynchronizationUnit.
     * @param {SynchronizationUnitCreateArgs} args - Arguments to create a SynchronizationUnit.
     * @example
     * // Create one SynchronizationUnit
     * const SynchronizationUnit = await prisma.synchronizationUnit.create({
     *   data: {
     *     // ... data to create a SynchronizationUnit
     *   }
     * })
     *
     */
    create<T extends SynchronizationUnitCreateArgs>(
      args: SelectSubset<T, SynchronizationUnitCreateArgs<ExtArgs>>,
    ): Prisma__SynchronizationUnitClient<
      $Result.GetResult<
        Prisma.$SynchronizationUnitPayload<ExtArgs>,
        T,
        "create"
      >,
      never,
      ExtArgs
    >;

    /**
     * Create many SynchronizationUnits.
     * @param {SynchronizationUnitCreateManyArgs} args - Arguments to create many SynchronizationUnits.
     * @example
     * // Create many SynchronizationUnits
     * const synchronizationUnit = await prisma.synchronizationUnit.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *
     */
    createMany<T extends SynchronizationUnitCreateManyArgs>(
      args?: SelectSubset<T, SynchronizationUnitCreateManyArgs<ExtArgs>>,
    ): Prisma.PrismaPromise<BatchPayload>;

    /**
     * Create many SynchronizationUnits and returns the data saved in the database.
     * @param {SynchronizationUnitCreateManyAndReturnArgs} args - Arguments to create many SynchronizationUnits.
     * @example
     * // Create many SynchronizationUnits
     * const synchronizationUnit = await prisma.synchronizationUnit.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *
     * // Create many SynchronizationUnits and only return the `id`
     * const synchronizationUnitWithIdOnly = await prisma.synchronizationUnit.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     *
     */
    createManyAndReturn<T extends SynchronizationUnitCreateManyAndReturnArgs>(
      args?: SelectSubset<
        T,
        SynchronizationUnitCreateManyAndReturnArgs<ExtArgs>
      >,
    ): Prisma.PrismaPromise<
      $Result.GetResult<
        Prisma.$SynchronizationUnitPayload<ExtArgs>,
        T,
        "createManyAndReturn"
      >
    >;

    /**
     * Delete a SynchronizationUnit.
     * @param {SynchronizationUnitDeleteArgs} args - Arguments to delete one SynchronizationUnit.
     * @example
     * // Delete one SynchronizationUnit
     * const SynchronizationUnit = await prisma.synchronizationUnit.delete({
     *   where: {
     *     // ... filter to delete one SynchronizationUnit
     *   }
     * })
     *
     */
    delete<T extends SynchronizationUnitDeleteArgs>(
      args: SelectSubset<T, SynchronizationUnitDeleteArgs<ExtArgs>>,
    ): Prisma__SynchronizationUnitClient<
      $Result.GetResult<
        Prisma.$SynchronizationUnitPayload<ExtArgs>,
        T,
        "delete"
      >,
      never,
      ExtArgs
    >;

    /**
     * Update one SynchronizationUnit.
     * @param {SynchronizationUnitUpdateArgs} args - Arguments to update one SynchronizationUnit.
     * @example
     * // Update one SynchronizationUnit
     * const synchronizationUnit = await prisma.synchronizationUnit.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     *
     */
    update<T extends SynchronizationUnitUpdateArgs>(
      args: SelectSubset<T, SynchronizationUnitUpdateArgs<ExtArgs>>,
    ): Prisma__SynchronizationUnitClient<
      $Result.GetResult<
        Prisma.$SynchronizationUnitPayload<ExtArgs>,
        T,
        "update"
      >,
      never,
      ExtArgs
    >;

    /**
     * Delete zero or more SynchronizationUnits.
     * @param {SynchronizationUnitDeleteManyArgs} args - Arguments to filter SynchronizationUnits to delete.
     * @example
     * // Delete a few SynchronizationUnits
     * const { count } = await prisma.synchronizationUnit.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     *
     */
    deleteMany<T extends SynchronizationUnitDeleteManyArgs>(
      args?: SelectSubset<T, SynchronizationUnitDeleteManyArgs<ExtArgs>>,
    ): Prisma.PrismaPromise<BatchPayload>;

    /**
     * Update zero or more SynchronizationUnits.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SynchronizationUnitUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many SynchronizationUnits
     * const synchronizationUnit = await prisma.synchronizationUnit.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     *
     */
    updateMany<T extends SynchronizationUnitUpdateManyArgs>(
      args: SelectSubset<T, SynchronizationUnitUpdateManyArgs<ExtArgs>>,
    ): Prisma.PrismaPromise<BatchPayload>;

    /**
     * Create or update one SynchronizationUnit.
     * @param {SynchronizationUnitUpsertArgs} args - Arguments to update or create a SynchronizationUnit.
     * @example
     * // Update or create a SynchronizationUnit
     * const synchronizationUnit = await prisma.synchronizationUnit.upsert({
     *   create: {
     *     // ... data to create a SynchronizationUnit
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the SynchronizationUnit we want to update
     *   }
     * })
     */
    upsert<T extends SynchronizationUnitUpsertArgs>(
      args: SelectSubset<T, SynchronizationUnitUpsertArgs<ExtArgs>>,
    ): Prisma__SynchronizationUnitClient<
      $Result.GetResult<
        Prisma.$SynchronizationUnitPayload<ExtArgs>,
        T,
        "upsert"
      >,
      never,
      ExtArgs
    >;

    /**
     * Count the number of SynchronizationUnits.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SynchronizationUnitCountArgs} args - Arguments to filter SynchronizationUnits to count.
     * @example
     * // Count the number of SynchronizationUnits
     * const count = await prisma.synchronizationUnit.count({
     *   where: {
     *     // ... the filter for the SynchronizationUnits we want to count
     *   }
     * })
     **/
    count<T extends SynchronizationUnitCountArgs>(
      args?: Subset<T, SynchronizationUnitCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<"select", any>
        ? T["select"] extends true
          ? number
          : GetScalarType<
              T["select"],
              SynchronizationUnitCountAggregateOutputType
            >
        : number
    >;

    /**
     * Allows you to perform aggregations operations on a SynchronizationUnit.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SynchronizationUnitAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
     **/
    aggregate<T extends SynchronizationUnitAggregateArgs>(
      args: Subset<T, SynchronizationUnitAggregateArgs>,
    ): Prisma.PrismaPromise<GetSynchronizationUnitAggregateType<T>>;

    /**
     * Group by SynchronizationUnit.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SynchronizationUnitGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     *
     **/
    groupBy<
      T extends SynchronizationUnitGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<"skip", Keys<T>>,
        Extends<"take", Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: SynchronizationUnitGroupByArgs["orderBy"] }
        : { orderBy?: SynchronizationUnitGroupByArgs["orderBy"] },
      OrderFields extends ExcludeUnderscoreKeys<
        Keys<MaybeTupleToUnion<T["orderBy"]>>
      >,
      ByFields extends MaybeTupleToUnion<T["by"]>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T["having"]>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T["by"] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
        ? `Error: "by" must not be empty.`
        : HavingValid extends False
          ? {
              [P in HavingFields]: P extends ByFields
                ? never
                : P extends string
                  ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
                  : [
                      Error,
                      "Field ",
                      P,
                      ` in "having" needs to be provided in "by"`,
                    ];
            }[HavingFields]
          : "take" extends Keys<T>
            ? "orderBy" extends Keys<T>
              ? ByValid extends True
                ? {}
                : {
                    [P in OrderFields]: P extends ByFields
                      ? never
                      : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`;
                  }[OrderFields]
              : 'Error: If you provide "take", you also need to provide "orderBy"'
            : "skip" extends Keys<T>
              ? "orderBy" extends Keys<T>
                ? ByValid extends True
                  ? {}
                  : {
                      [P in OrderFields]: P extends ByFields
                        ? never
                        : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`;
                    }[OrderFields]
                : 'Error: If you provide "skip", you also need to provide "orderBy"'
              : ByValid extends True
                ? {}
                : {
                    [P in OrderFields]: P extends ByFields
                      ? never
                      : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`;
                  }[OrderFields],
    >(
      args: SubsetIntersection<T, SynchronizationUnitGroupByArgs, OrderByArg> &
        InputErrors,
    ): {} extends InputErrors
      ? GetSynchronizationUnitGroupByPayload<T>
      : Prisma.PrismaPromise<InputErrors>;
    /**
     * Fields of the SynchronizationUnit model
     */
    readonly fields: SynchronizationUnitFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for SynchronizationUnit.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__SynchronizationUnitClient<
    T,
    Null = never,
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise";
    Document<T extends DocumentDefaultArgs<ExtArgs> = {}>(
      args?: Subset<T, DocumentDefaultArgs<ExtArgs>>,
    ): Prisma__DocumentClient<
      | $Result.GetResult<
          Prisma.$DocumentPayload<ExtArgs>,
          T,
          "findUniqueOrThrow"
        >
      | Null,
      Null,
      ExtArgs
    >;
    operations<T extends SynchronizationUnit$operationsArgs<ExtArgs> = {}>(
      args?: Subset<T, SynchronizationUnit$operationsArgs<ExtArgs>>,
    ): Prisma.PrismaPromise<
      $Result.GetResult<Prisma.$OperationPayload<ExtArgs>, T, "findMany"> | Null
    >;
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(
      onfulfilled?:
        | ((value: T) => TResult1 | PromiseLike<TResult1>)
        | undefined
        | null,
      onrejected?:
        | ((reason: any) => TResult2 | PromiseLike<TResult2>)
        | undefined
        | null,
    ): $Utils.JsPromise<TResult1 | TResult2>;
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(
      onrejected?:
        | ((reason: any) => TResult | PromiseLike<TResult>)
        | undefined
        | null,
    ): $Utils.JsPromise<T | TResult>;
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>;
  }

  /**
   * Fields of the SynchronizationUnit model
   */
  interface SynchronizationUnitFieldRefs {
    readonly id: FieldRef<"SynchronizationUnit", "String">;
    readonly documentId: FieldRef<"SynchronizationUnit", "String">;
    readonly scope: FieldRef<"SynchronizationUnit", "String">;
    readonly branch: FieldRef<"SynchronizationUnit", "String">;
  }

  // Custom InputTypes
  /**
   * SynchronizationUnit findUnique
   */
  export type SynchronizationUnitFindUniqueArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * Select specific fields to fetch from the SynchronizationUnit
     */
    select?: SynchronizationUnitSelect<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SynchronizationUnitInclude<ExtArgs> | null;
    /**
     * Filter, which SynchronizationUnit to fetch.
     */
    where: SynchronizationUnitWhereUniqueInput;
  };

  /**
   * SynchronizationUnit findUniqueOrThrow
   */
  export type SynchronizationUnitFindUniqueOrThrowArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * Select specific fields to fetch from the SynchronizationUnit
     */
    select?: SynchronizationUnitSelect<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SynchronizationUnitInclude<ExtArgs> | null;
    /**
     * Filter, which SynchronizationUnit to fetch.
     */
    where: SynchronizationUnitWhereUniqueInput;
  };

  /**
   * SynchronizationUnit findFirst
   */
  export type SynchronizationUnitFindFirstArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * Select specific fields to fetch from the SynchronizationUnit
     */
    select?: SynchronizationUnitSelect<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SynchronizationUnitInclude<ExtArgs> | null;
    /**
     * Filter, which SynchronizationUnit to fetch.
     */
    where?: SynchronizationUnitWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of SynchronizationUnits to fetch.
     */
    orderBy?:
      | SynchronizationUnitOrderByWithRelationInput
      | SynchronizationUnitOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the position for searching for SynchronizationUnits.
     */
    cursor?: SynchronizationUnitWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` SynchronizationUnits from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` SynchronizationUnits.
     */
    skip?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     *
     * Filter by unique combinations of SynchronizationUnits.
     */
    distinct?:
      | SynchronizationUnitScalarFieldEnum
      | SynchronizationUnitScalarFieldEnum[];
  };

  /**
   * SynchronizationUnit findFirstOrThrow
   */
  export type SynchronizationUnitFindFirstOrThrowArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * Select specific fields to fetch from the SynchronizationUnit
     */
    select?: SynchronizationUnitSelect<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SynchronizationUnitInclude<ExtArgs> | null;
    /**
     * Filter, which SynchronizationUnit to fetch.
     */
    where?: SynchronizationUnitWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of SynchronizationUnits to fetch.
     */
    orderBy?:
      | SynchronizationUnitOrderByWithRelationInput
      | SynchronizationUnitOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the position for searching for SynchronizationUnits.
     */
    cursor?: SynchronizationUnitWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` SynchronizationUnits from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` SynchronizationUnits.
     */
    skip?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     *
     * Filter by unique combinations of SynchronizationUnits.
     */
    distinct?:
      | SynchronizationUnitScalarFieldEnum
      | SynchronizationUnitScalarFieldEnum[];
  };

  /**
   * SynchronizationUnit findMany
   */
  export type SynchronizationUnitFindManyArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * Select specific fields to fetch from the SynchronizationUnit
     */
    select?: SynchronizationUnitSelect<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SynchronizationUnitInclude<ExtArgs> | null;
    /**
     * Filter, which SynchronizationUnits to fetch.
     */
    where?: SynchronizationUnitWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of SynchronizationUnits to fetch.
     */
    orderBy?:
      | SynchronizationUnitOrderByWithRelationInput
      | SynchronizationUnitOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the position for listing SynchronizationUnits.
     */
    cursor?: SynchronizationUnitWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` SynchronizationUnits from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` SynchronizationUnits.
     */
    skip?: number;
    distinct?:
      | SynchronizationUnitScalarFieldEnum
      | SynchronizationUnitScalarFieldEnum[];
  };

  /**
   * SynchronizationUnit create
   */
  export type SynchronizationUnitCreateArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * Select specific fields to fetch from the SynchronizationUnit
     */
    select?: SynchronizationUnitSelect<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SynchronizationUnitInclude<ExtArgs> | null;
    /**
     * The data needed to create a SynchronizationUnit.
     */
    data: XOR<
      SynchronizationUnitCreateInput,
      SynchronizationUnitUncheckedCreateInput
    >;
  };

  /**
   * SynchronizationUnit createMany
   */
  export type SynchronizationUnitCreateManyArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * The data used to create many SynchronizationUnits.
     */
    data:
      | SynchronizationUnitCreateManyInput
      | SynchronizationUnitCreateManyInput[];
    skipDuplicates?: boolean;
  };

  /**
   * SynchronizationUnit createManyAndReturn
   */
  export type SynchronizationUnitCreateManyAndReturnArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * Select specific fields to fetch from the SynchronizationUnit
     */
    select?: SynchronizationUnitSelectCreateManyAndReturn<ExtArgs> | null;
    /**
     * The data used to create many SynchronizationUnits.
     */
    data:
      | SynchronizationUnitCreateManyInput
      | SynchronizationUnitCreateManyInput[];
    skipDuplicates?: boolean;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SynchronizationUnitIncludeCreateManyAndReturn<ExtArgs> | null;
  };

  /**
   * SynchronizationUnit update
   */
  export type SynchronizationUnitUpdateArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * Select specific fields to fetch from the SynchronizationUnit
     */
    select?: SynchronizationUnitSelect<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SynchronizationUnitInclude<ExtArgs> | null;
    /**
     * The data needed to update a SynchronizationUnit.
     */
    data: XOR<
      SynchronizationUnitUpdateInput,
      SynchronizationUnitUncheckedUpdateInput
    >;
    /**
     * Choose, which SynchronizationUnit to update.
     */
    where: SynchronizationUnitWhereUniqueInput;
  };

  /**
   * SynchronizationUnit updateMany
   */
  export type SynchronizationUnitUpdateManyArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * The data used to update SynchronizationUnits.
     */
    data: XOR<
      SynchronizationUnitUpdateManyMutationInput,
      SynchronizationUnitUncheckedUpdateManyInput
    >;
    /**
     * Filter which SynchronizationUnits to update
     */
    where?: SynchronizationUnitWhereInput;
  };

  /**
   * SynchronizationUnit upsert
   */
  export type SynchronizationUnitUpsertArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * Select specific fields to fetch from the SynchronizationUnit
     */
    select?: SynchronizationUnitSelect<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SynchronizationUnitInclude<ExtArgs> | null;
    /**
     * The filter to search for the SynchronizationUnit to update in case it exists.
     */
    where: SynchronizationUnitWhereUniqueInput;
    /**
     * In case the SynchronizationUnit found by the `where` argument doesn't exist, create a new SynchronizationUnit with this data.
     */
    create: XOR<
      SynchronizationUnitCreateInput,
      SynchronizationUnitUncheckedCreateInput
    >;
    /**
     * In case the SynchronizationUnit was found with the provided `where` argument, update it with this data.
     */
    update: XOR<
      SynchronizationUnitUpdateInput,
      SynchronizationUnitUncheckedUpdateInput
    >;
  };

  /**
   * SynchronizationUnit delete
   */
  export type SynchronizationUnitDeleteArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * Select specific fields to fetch from the SynchronizationUnit
     */
    select?: SynchronizationUnitSelect<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SynchronizationUnitInclude<ExtArgs> | null;
    /**
     * Filter which SynchronizationUnit to delete.
     */
    where: SynchronizationUnitWhereUniqueInput;
  };

  /**
   * SynchronizationUnit deleteMany
   */
  export type SynchronizationUnitDeleteManyArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * Filter which SynchronizationUnits to delete
     */
    where?: SynchronizationUnitWhereInput;
  };

  /**
   * SynchronizationUnit.operations
   */
  export type SynchronizationUnit$operationsArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * Select specific fields to fetch from the Operation
     */
    select?: OperationSelect<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: OperationInclude<ExtArgs> | null;
    where?: OperationWhereInput;
    orderBy?:
      | OperationOrderByWithRelationInput
      | OperationOrderByWithRelationInput[];
    cursor?: OperationWhereUniqueInput;
    take?: number;
    skip?: number;
    distinct?: OperationScalarFieldEnum | OperationScalarFieldEnum[];
  };

  /**
   * SynchronizationUnit without action
   */
  export type SynchronizationUnitDefaultArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * Select specific fields to fetch from the SynchronizationUnit
     */
    select?: SynchronizationUnitSelect<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SynchronizationUnitInclude<ExtArgs> | null;
  };

  /**
   * Model Attachment
   */

  export type AggregateAttachment = {
    _count: AttachmentCountAggregateOutputType | null;
    _min: AttachmentMinAggregateOutputType | null;
    _max: AttachmentMaxAggregateOutputType | null;
  };

  export type AttachmentMinAggregateOutputType = {
    id: string | null;
    operationId: string | null;
    mimeType: string | null;
    data: string | null;
    filename: string | null;
    extension: string | null;
    hash: string | null;
  };

  export type AttachmentMaxAggregateOutputType = {
    id: string | null;
    operationId: string | null;
    mimeType: string | null;
    data: string | null;
    filename: string | null;
    extension: string | null;
    hash: string | null;
  };

  export type AttachmentCountAggregateOutputType = {
    id: number;
    operationId: number;
    mimeType: number;
    data: number;
    filename: number;
    extension: number;
    hash: number;
    _all: number;
  };

  export type AttachmentMinAggregateInputType = {
    id?: true;
    operationId?: true;
    mimeType?: true;
    data?: true;
    filename?: true;
    extension?: true;
    hash?: true;
  };

  export type AttachmentMaxAggregateInputType = {
    id?: true;
    operationId?: true;
    mimeType?: true;
    data?: true;
    filename?: true;
    extension?: true;
    hash?: true;
  };

  export type AttachmentCountAggregateInputType = {
    id?: true;
    operationId?: true;
    mimeType?: true;
    data?: true;
    filename?: true;
    extension?: true;
    hash?: true;
    _all?: true;
  };

  export type AttachmentAggregateArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * Filter which Attachment to aggregate.
     */
    where?: AttachmentWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of Attachments to fetch.
     */
    orderBy?:
      | AttachmentOrderByWithRelationInput
      | AttachmentOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the start position
     */
    cursor?: AttachmentWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` Attachments from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` Attachments.
     */
    skip?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Count returned Attachments
     **/
    _count?: true | AttachmentCountAggregateInputType;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Select which fields to find the minimum value
     **/
    _min?: AttachmentMinAggregateInputType;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Select which fields to find the maximum value
     **/
    _max?: AttachmentMaxAggregateInputType;
  };

  export type GetAttachmentAggregateType<T extends AttachmentAggregateArgs> = {
    [P in keyof T & keyof AggregateAttachment]: P extends "_count" | "count"
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateAttachment[P]>
      : GetScalarType<T[P], AggregateAttachment[P]>;
  };

  export type AttachmentGroupByArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    where?: AttachmentWhereInput;
    orderBy?:
      | AttachmentOrderByWithAggregationInput
      | AttachmentOrderByWithAggregationInput[];
    by: AttachmentScalarFieldEnum[] | AttachmentScalarFieldEnum;
    having?: AttachmentScalarWhereWithAggregatesInput;
    take?: number;
    skip?: number;
    _count?: AttachmentCountAggregateInputType | true;
    _min?: AttachmentMinAggregateInputType;
    _max?: AttachmentMaxAggregateInputType;
  };

  export type AttachmentGroupByOutputType = {
    id: string;
    operationId: string;
    mimeType: string;
    data: string;
    filename: string | null;
    extension: string | null;
    hash: string;
    _count: AttachmentCountAggregateOutputType | null;
    _min: AttachmentMinAggregateOutputType | null;
    _max: AttachmentMaxAggregateOutputType | null;
  };

  type GetAttachmentGroupByPayload<T extends AttachmentGroupByArgs> =
    Prisma.PrismaPromise<
      Array<
        PickEnumerable<AttachmentGroupByOutputType, T["by"]> & {
          [P in keyof T & keyof AttachmentGroupByOutputType]: P extends "_count"
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], AttachmentGroupByOutputType[P]>
            : GetScalarType<T[P], AttachmentGroupByOutputType[P]>;
        }
      >
    >;

  export type AttachmentSelect<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = $Extensions.GetSelect<
    {
      id?: boolean;
      operationId?: boolean;
      mimeType?: boolean;
      data?: boolean;
      filename?: boolean;
      extension?: boolean;
      hash?: boolean;
      Operation?: boolean | OperationDefaultArgs<ExtArgs>;
    },
    ExtArgs["result"]["attachment"]
  >;

  export type AttachmentSelectCreateManyAndReturn<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = $Extensions.GetSelect<
    {
      id?: boolean;
      operationId?: boolean;
      mimeType?: boolean;
      data?: boolean;
      filename?: boolean;
      extension?: boolean;
      hash?: boolean;
      Operation?: boolean | OperationDefaultArgs<ExtArgs>;
    },
    ExtArgs["result"]["attachment"]
  >;

  export type AttachmentSelectScalar = {
    id?: boolean;
    operationId?: boolean;
    mimeType?: boolean;
    data?: boolean;
    filename?: boolean;
    extension?: boolean;
    hash?: boolean;
  };

  export type AttachmentInclude<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    Operation?: boolean | OperationDefaultArgs<ExtArgs>;
  };
  export type AttachmentIncludeCreateManyAndReturn<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    Operation?: boolean | OperationDefaultArgs<ExtArgs>;
  };

  export type $AttachmentPayload<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    name: "Attachment";
    objects: {
      Operation: Prisma.$OperationPayload<ExtArgs>;
    };
    scalars: $Extensions.GetPayloadResult<
      {
        id: string;
        operationId: string;
        mimeType: string;
        data: string;
        filename: string | null;
        extension: string | null;
        hash: string;
      },
      ExtArgs["result"]["attachment"]
    >;
    composites: {};
  };

  type AttachmentGetPayload<
    S extends boolean | null | undefined | AttachmentDefaultArgs,
  > = $Result.GetResult<Prisma.$AttachmentPayload, S>;

  type AttachmentCountArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = Omit<AttachmentFindManyArgs, "select" | "include" | "distinct"> & {
    select?: AttachmentCountAggregateInputType | true;
  };

  export interface AttachmentDelegate<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > {
    [K: symbol]: {
      types: Prisma.TypeMap<ExtArgs>["model"]["Attachment"];
      meta: { name: "Attachment" };
    };
    /**
     * Find zero or one Attachment that matches the filter.
     * @param {AttachmentFindUniqueArgs} args - Arguments to find a Attachment
     * @example
     * // Get one Attachment
     * const attachment = await prisma.attachment.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends AttachmentFindUniqueArgs>(
      args: SelectSubset<T, AttachmentFindUniqueArgs<ExtArgs>>,
    ): Prisma__AttachmentClient<
      $Result.GetResult<
        Prisma.$AttachmentPayload<ExtArgs>,
        T,
        "findUnique"
      > | null,
      null,
      ExtArgs
    >;

    /**
     * Find one Attachment that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {AttachmentFindUniqueOrThrowArgs} args - Arguments to find a Attachment
     * @example
     * // Get one Attachment
     * const attachment = await prisma.attachment.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends AttachmentFindUniqueOrThrowArgs>(
      args: SelectSubset<T, AttachmentFindUniqueOrThrowArgs<ExtArgs>>,
    ): Prisma__AttachmentClient<
      $Result.GetResult<
        Prisma.$AttachmentPayload<ExtArgs>,
        T,
        "findUniqueOrThrow"
      >,
      never,
      ExtArgs
    >;

    /**
     * Find the first Attachment that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {AttachmentFindFirstArgs} args - Arguments to find a Attachment
     * @example
     * // Get one Attachment
     * const attachment = await prisma.attachment.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends AttachmentFindFirstArgs>(
      args?: SelectSubset<T, AttachmentFindFirstArgs<ExtArgs>>,
    ): Prisma__AttachmentClient<
      $Result.GetResult<
        Prisma.$AttachmentPayload<ExtArgs>,
        T,
        "findFirst"
      > | null,
      null,
      ExtArgs
    >;

    /**
     * Find the first Attachment that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {AttachmentFindFirstOrThrowArgs} args - Arguments to find a Attachment
     * @example
     * // Get one Attachment
     * const attachment = await prisma.attachment.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends AttachmentFindFirstOrThrowArgs>(
      args?: SelectSubset<T, AttachmentFindFirstOrThrowArgs<ExtArgs>>,
    ): Prisma__AttachmentClient<
      $Result.GetResult<
        Prisma.$AttachmentPayload<ExtArgs>,
        T,
        "findFirstOrThrow"
      >,
      never,
      ExtArgs
    >;

    /**
     * Find zero or more Attachments that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {AttachmentFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all Attachments
     * const attachments = await prisma.attachment.findMany()
     *
     * // Get first 10 Attachments
     * const attachments = await prisma.attachment.findMany({ take: 10 })
     *
     * // Only select the `id`
     * const attachmentWithIdOnly = await prisma.attachment.findMany({ select: { id: true } })
     *
     */
    findMany<T extends AttachmentFindManyArgs>(
      args?: SelectSubset<T, AttachmentFindManyArgs<ExtArgs>>,
    ): Prisma.PrismaPromise<
      $Result.GetResult<Prisma.$AttachmentPayload<ExtArgs>, T, "findMany">
    >;

    /**
     * Create a Attachment.
     * @param {AttachmentCreateArgs} args - Arguments to create a Attachment.
     * @example
     * // Create one Attachment
     * const Attachment = await prisma.attachment.create({
     *   data: {
     *     // ... data to create a Attachment
     *   }
     * })
     *
     */
    create<T extends AttachmentCreateArgs>(
      args: SelectSubset<T, AttachmentCreateArgs<ExtArgs>>,
    ): Prisma__AttachmentClient<
      $Result.GetResult<Prisma.$AttachmentPayload<ExtArgs>, T, "create">,
      never,
      ExtArgs
    >;

    /**
     * Create many Attachments.
     * @param {AttachmentCreateManyArgs} args - Arguments to create many Attachments.
     * @example
     * // Create many Attachments
     * const attachment = await prisma.attachment.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *
     */
    createMany<T extends AttachmentCreateManyArgs>(
      args?: SelectSubset<T, AttachmentCreateManyArgs<ExtArgs>>,
    ): Prisma.PrismaPromise<BatchPayload>;

    /**
     * Create many Attachments and returns the data saved in the database.
     * @param {AttachmentCreateManyAndReturnArgs} args - Arguments to create many Attachments.
     * @example
     * // Create many Attachments
     * const attachment = await prisma.attachment.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *
     * // Create many Attachments and only return the `id`
     * const attachmentWithIdOnly = await prisma.attachment.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     *
     */
    createManyAndReturn<T extends AttachmentCreateManyAndReturnArgs>(
      args?: SelectSubset<T, AttachmentCreateManyAndReturnArgs<ExtArgs>>,
    ): Prisma.PrismaPromise<
      $Result.GetResult<
        Prisma.$AttachmentPayload<ExtArgs>,
        T,
        "createManyAndReturn"
      >
    >;

    /**
     * Delete a Attachment.
     * @param {AttachmentDeleteArgs} args - Arguments to delete one Attachment.
     * @example
     * // Delete one Attachment
     * const Attachment = await prisma.attachment.delete({
     *   where: {
     *     // ... filter to delete one Attachment
     *   }
     * })
     *
     */
    delete<T extends AttachmentDeleteArgs>(
      args: SelectSubset<T, AttachmentDeleteArgs<ExtArgs>>,
    ): Prisma__AttachmentClient<
      $Result.GetResult<Prisma.$AttachmentPayload<ExtArgs>, T, "delete">,
      never,
      ExtArgs
    >;

    /**
     * Update one Attachment.
     * @param {AttachmentUpdateArgs} args - Arguments to update one Attachment.
     * @example
     * // Update one Attachment
     * const attachment = await prisma.attachment.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     *
     */
    update<T extends AttachmentUpdateArgs>(
      args: SelectSubset<T, AttachmentUpdateArgs<ExtArgs>>,
    ): Prisma__AttachmentClient<
      $Result.GetResult<Prisma.$AttachmentPayload<ExtArgs>, T, "update">,
      never,
      ExtArgs
    >;

    /**
     * Delete zero or more Attachments.
     * @param {AttachmentDeleteManyArgs} args - Arguments to filter Attachments to delete.
     * @example
     * // Delete a few Attachments
     * const { count } = await prisma.attachment.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     *
     */
    deleteMany<T extends AttachmentDeleteManyArgs>(
      args?: SelectSubset<T, AttachmentDeleteManyArgs<ExtArgs>>,
    ): Prisma.PrismaPromise<BatchPayload>;

    /**
     * Update zero or more Attachments.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {AttachmentUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many Attachments
     * const attachment = await prisma.attachment.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     *
     */
    updateMany<T extends AttachmentUpdateManyArgs>(
      args: SelectSubset<T, AttachmentUpdateManyArgs<ExtArgs>>,
    ): Prisma.PrismaPromise<BatchPayload>;

    /**
     * Create or update one Attachment.
     * @param {AttachmentUpsertArgs} args - Arguments to update or create a Attachment.
     * @example
     * // Update or create a Attachment
     * const attachment = await prisma.attachment.upsert({
     *   create: {
     *     // ... data to create a Attachment
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the Attachment we want to update
     *   }
     * })
     */
    upsert<T extends AttachmentUpsertArgs>(
      args: SelectSubset<T, AttachmentUpsertArgs<ExtArgs>>,
    ): Prisma__AttachmentClient<
      $Result.GetResult<Prisma.$AttachmentPayload<ExtArgs>, T, "upsert">,
      never,
      ExtArgs
    >;

    /**
     * Count the number of Attachments.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {AttachmentCountArgs} args - Arguments to filter Attachments to count.
     * @example
     * // Count the number of Attachments
     * const count = await prisma.attachment.count({
     *   where: {
     *     // ... the filter for the Attachments we want to count
     *   }
     * })
     **/
    count<T extends AttachmentCountArgs>(
      args?: Subset<T, AttachmentCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<"select", any>
        ? T["select"] extends true
          ? number
          : GetScalarType<T["select"], AttachmentCountAggregateOutputType>
        : number
    >;

    /**
     * Allows you to perform aggregations operations on a Attachment.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {AttachmentAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
     **/
    aggregate<T extends AttachmentAggregateArgs>(
      args: Subset<T, AttachmentAggregateArgs>,
    ): Prisma.PrismaPromise<GetAttachmentAggregateType<T>>;

    /**
     * Group by Attachment.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {AttachmentGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     *
     **/
    groupBy<
      T extends AttachmentGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<"skip", Keys<T>>,
        Extends<"take", Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: AttachmentGroupByArgs["orderBy"] }
        : { orderBy?: AttachmentGroupByArgs["orderBy"] },
      OrderFields extends ExcludeUnderscoreKeys<
        Keys<MaybeTupleToUnion<T["orderBy"]>>
      >,
      ByFields extends MaybeTupleToUnion<T["by"]>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T["having"]>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T["by"] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
        ? `Error: "by" must not be empty.`
        : HavingValid extends False
          ? {
              [P in HavingFields]: P extends ByFields
                ? never
                : P extends string
                  ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
                  : [
                      Error,
                      "Field ",
                      P,
                      ` in "having" needs to be provided in "by"`,
                    ];
            }[HavingFields]
          : "take" extends Keys<T>
            ? "orderBy" extends Keys<T>
              ? ByValid extends True
                ? {}
                : {
                    [P in OrderFields]: P extends ByFields
                      ? never
                      : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`;
                  }[OrderFields]
              : 'Error: If you provide "take", you also need to provide "orderBy"'
            : "skip" extends Keys<T>
              ? "orderBy" extends Keys<T>
                ? ByValid extends True
                  ? {}
                  : {
                      [P in OrderFields]: P extends ByFields
                        ? never
                        : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`;
                    }[OrderFields]
                : 'Error: If you provide "skip", you also need to provide "orderBy"'
              : ByValid extends True
                ? {}
                : {
                    [P in OrderFields]: P extends ByFields
                      ? never
                      : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`;
                  }[OrderFields],
    >(
      args: SubsetIntersection<T, AttachmentGroupByArgs, OrderByArg> &
        InputErrors,
    ): {} extends InputErrors
      ? GetAttachmentGroupByPayload<T>
      : Prisma.PrismaPromise<InputErrors>;
    /**
     * Fields of the Attachment model
     */
    readonly fields: AttachmentFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for Attachment.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__AttachmentClient<
    T,
    Null = never,
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise";
    Operation<T extends OperationDefaultArgs<ExtArgs> = {}>(
      args?: Subset<T, OperationDefaultArgs<ExtArgs>>,
    ): Prisma__OperationClient<
      | $Result.GetResult<
          Prisma.$OperationPayload<ExtArgs>,
          T,
          "findUniqueOrThrow"
        >
      | Null,
      Null,
      ExtArgs
    >;
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(
      onfulfilled?:
        | ((value: T) => TResult1 | PromiseLike<TResult1>)
        | undefined
        | null,
      onrejected?:
        | ((reason: any) => TResult2 | PromiseLike<TResult2>)
        | undefined
        | null,
    ): $Utils.JsPromise<TResult1 | TResult2>;
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(
      onrejected?:
        | ((reason: any) => TResult | PromiseLike<TResult>)
        | undefined
        | null,
    ): $Utils.JsPromise<T | TResult>;
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>;
  }

  /**
   * Fields of the Attachment model
   */
  interface AttachmentFieldRefs {
    readonly id: FieldRef<"Attachment", "String">;
    readonly operationId: FieldRef<"Attachment", "String">;
    readonly mimeType: FieldRef<"Attachment", "String">;
    readonly data: FieldRef<"Attachment", "String">;
    readonly filename: FieldRef<"Attachment", "String">;
    readonly extension: FieldRef<"Attachment", "String">;
    readonly hash: FieldRef<"Attachment", "String">;
  }

  // Custom InputTypes
  /**
   * Attachment findUnique
   */
  export type AttachmentFindUniqueArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * Select specific fields to fetch from the Attachment
     */
    select?: AttachmentSelect<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: AttachmentInclude<ExtArgs> | null;
    /**
     * Filter, which Attachment to fetch.
     */
    where: AttachmentWhereUniqueInput;
  };

  /**
   * Attachment findUniqueOrThrow
   */
  export type AttachmentFindUniqueOrThrowArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * Select specific fields to fetch from the Attachment
     */
    select?: AttachmentSelect<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: AttachmentInclude<ExtArgs> | null;
    /**
     * Filter, which Attachment to fetch.
     */
    where: AttachmentWhereUniqueInput;
  };

  /**
   * Attachment findFirst
   */
  export type AttachmentFindFirstArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * Select specific fields to fetch from the Attachment
     */
    select?: AttachmentSelect<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: AttachmentInclude<ExtArgs> | null;
    /**
     * Filter, which Attachment to fetch.
     */
    where?: AttachmentWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of Attachments to fetch.
     */
    orderBy?:
      | AttachmentOrderByWithRelationInput
      | AttachmentOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the position for searching for Attachments.
     */
    cursor?: AttachmentWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` Attachments from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` Attachments.
     */
    skip?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     *
     * Filter by unique combinations of Attachments.
     */
    distinct?: AttachmentScalarFieldEnum | AttachmentScalarFieldEnum[];
  };

  /**
   * Attachment findFirstOrThrow
   */
  export type AttachmentFindFirstOrThrowArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * Select specific fields to fetch from the Attachment
     */
    select?: AttachmentSelect<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: AttachmentInclude<ExtArgs> | null;
    /**
     * Filter, which Attachment to fetch.
     */
    where?: AttachmentWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of Attachments to fetch.
     */
    orderBy?:
      | AttachmentOrderByWithRelationInput
      | AttachmentOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the position for searching for Attachments.
     */
    cursor?: AttachmentWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` Attachments from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` Attachments.
     */
    skip?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     *
     * Filter by unique combinations of Attachments.
     */
    distinct?: AttachmentScalarFieldEnum | AttachmentScalarFieldEnum[];
  };

  /**
   * Attachment findMany
   */
  export type AttachmentFindManyArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * Select specific fields to fetch from the Attachment
     */
    select?: AttachmentSelect<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: AttachmentInclude<ExtArgs> | null;
    /**
     * Filter, which Attachments to fetch.
     */
    where?: AttachmentWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of Attachments to fetch.
     */
    orderBy?:
      | AttachmentOrderByWithRelationInput
      | AttachmentOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the position for listing Attachments.
     */
    cursor?: AttachmentWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` Attachments from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` Attachments.
     */
    skip?: number;
    distinct?: AttachmentScalarFieldEnum | AttachmentScalarFieldEnum[];
  };

  /**
   * Attachment create
   */
  export type AttachmentCreateArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * Select specific fields to fetch from the Attachment
     */
    select?: AttachmentSelect<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: AttachmentInclude<ExtArgs> | null;
    /**
     * The data needed to create a Attachment.
     */
    data: XOR<AttachmentCreateInput, AttachmentUncheckedCreateInput>;
  };

  /**
   * Attachment createMany
   */
  export type AttachmentCreateManyArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * The data used to create many Attachments.
     */
    data: AttachmentCreateManyInput | AttachmentCreateManyInput[];
    skipDuplicates?: boolean;
  };

  /**
   * Attachment createManyAndReturn
   */
  export type AttachmentCreateManyAndReturnArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * Select specific fields to fetch from the Attachment
     */
    select?: AttachmentSelectCreateManyAndReturn<ExtArgs> | null;
    /**
     * The data used to create many Attachments.
     */
    data: AttachmentCreateManyInput | AttachmentCreateManyInput[];
    skipDuplicates?: boolean;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: AttachmentIncludeCreateManyAndReturn<ExtArgs> | null;
  };

  /**
   * Attachment update
   */
  export type AttachmentUpdateArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * Select specific fields to fetch from the Attachment
     */
    select?: AttachmentSelect<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: AttachmentInclude<ExtArgs> | null;
    /**
     * The data needed to update a Attachment.
     */
    data: XOR<AttachmentUpdateInput, AttachmentUncheckedUpdateInput>;
    /**
     * Choose, which Attachment to update.
     */
    where: AttachmentWhereUniqueInput;
  };

  /**
   * Attachment updateMany
   */
  export type AttachmentUpdateManyArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * The data used to update Attachments.
     */
    data: XOR<
      AttachmentUpdateManyMutationInput,
      AttachmentUncheckedUpdateManyInput
    >;
    /**
     * Filter which Attachments to update
     */
    where?: AttachmentWhereInput;
  };

  /**
   * Attachment upsert
   */
  export type AttachmentUpsertArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * Select specific fields to fetch from the Attachment
     */
    select?: AttachmentSelect<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: AttachmentInclude<ExtArgs> | null;
    /**
     * The filter to search for the Attachment to update in case it exists.
     */
    where: AttachmentWhereUniqueInput;
    /**
     * In case the Attachment found by the `where` argument doesn't exist, create a new Attachment with this data.
     */
    create: XOR<AttachmentCreateInput, AttachmentUncheckedCreateInput>;
    /**
     * In case the Attachment was found with the provided `where` argument, update it with this data.
     */
    update: XOR<AttachmentUpdateInput, AttachmentUncheckedUpdateInput>;
  };

  /**
   * Attachment delete
   */
  export type AttachmentDeleteArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * Select specific fields to fetch from the Attachment
     */
    select?: AttachmentSelect<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: AttachmentInclude<ExtArgs> | null;
    /**
     * Filter which Attachment to delete.
     */
    where: AttachmentWhereUniqueInput;
  };

  /**
   * Attachment deleteMany
   */
  export type AttachmentDeleteManyArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * Filter which Attachments to delete
     */
    where?: AttachmentWhereInput;
  };

  /**
   * Attachment without action
   */
  export type AttachmentDefaultArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * Select specific fields to fetch from the Attachment
     */
    select?: AttachmentSelect<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: AttachmentInclude<ExtArgs> | null;
  };

  /**
   * Enums
   */

  export const TransactionIsolationLevel: {
    ReadUncommitted: "ReadUncommitted";
    ReadCommitted: "ReadCommitted";
    RepeatableRead: "RepeatableRead";
    Serializable: "Serializable";
  };

  export type TransactionIsolationLevel =
    (typeof TransactionIsolationLevel)[keyof typeof TransactionIsolationLevel];

  export const DriveScalarFieldEnum: {
    id: "id";
  };

  export type DriveScalarFieldEnum =
    (typeof DriveScalarFieldEnum)[keyof typeof DriveScalarFieldEnum];

  export const DocumentScalarFieldEnum: {
    id: "id";
    ordinal: "ordinal";
    created: "created";
    lastModified: "lastModified";
    slug: "slug";
    revision: "revision";
    name: "name";
    initialState: "initialState";
    documentType: "documentType";
    meta: "meta";
    scopes: "scopes";
  };

  export type DocumentScalarFieldEnum =
    (typeof DocumentScalarFieldEnum)[keyof typeof DocumentScalarFieldEnum];

  export const DriveDocumentScalarFieldEnum: {
    driveId: "driveId";
    documentId: "documentId";
  };

  export type DriveDocumentScalarFieldEnum =
    (typeof DriveDocumentScalarFieldEnum)[keyof typeof DriveDocumentScalarFieldEnum];

  export const OperationScalarFieldEnum: {
    id: "id";
    opId: "opId";
    documentId: "documentId";
    scope: "scope";
    branch: "branch";
    index: "index";
    skip: "skip";
    hash: "hash";
    timestamp: "timestamp";
    actionId: "actionId";
    input: "input";
    type: "type";
    syncId: "syncId";
    clipboard: "clipboard";
    context: "context";
    resultingState: "resultingState";
  };

  export type OperationScalarFieldEnum =
    (typeof OperationScalarFieldEnum)[keyof typeof OperationScalarFieldEnum];

  export const SynchronizationUnitScalarFieldEnum: {
    id: "id";
    documentId: "documentId";
    scope: "scope";
    branch: "branch";
  };

  export type SynchronizationUnitScalarFieldEnum =
    (typeof SynchronizationUnitScalarFieldEnum)[keyof typeof SynchronizationUnitScalarFieldEnum];

  export const AttachmentScalarFieldEnum: {
    id: "id";
    operationId: "operationId";
    mimeType: "mimeType";
    data: "data";
    filename: "filename";
    extension: "extension";
    hash: "hash";
  };

  export type AttachmentScalarFieldEnum =
    (typeof AttachmentScalarFieldEnum)[keyof typeof AttachmentScalarFieldEnum];

  export const SortOrder: {
    asc: "asc";
    desc: "desc";
  };

  export type SortOrder = (typeof SortOrder)[keyof typeof SortOrder];

  export const NullableJsonNullValueInput: {
    DbNull: typeof DbNull;
    JsonNull: typeof JsonNull;
  };

  export type NullableJsonNullValueInput =
    (typeof NullableJsonNullValueInput)[keyof typeof NullableJsonNullValueInput];

  export const QueryMode: {
    default: "default";
    insensitive: "insensitive";
  };

  export type QueryMode = (typeof QueryMode)[keyof typeof QueryMode];

  export const NullsOrder: {
    first: "first";
    last: "last";
  };

  export type NullsOrder = (typeof NullsOrder)[keyof typeof NullsOrder];

  export const JsonNullValueFilter: {
    DbNull: typeof DbNull;
    JsonNull: typeof JsonNull;
    AnyNull: typeof AnyNull;
  };

  export type JsonNullValueFilter =
    (typeof JsonNullValueFilter)[keyof typeof JsonNullValueFilter];

  /**
   * Field references
   */

  /**
   * Reference to a field of type 'String'
   */
  export type StringFieldRefInput<$PrismaModel> = FieldRefInputType<
    $PrismaModel,
    "String"
  >;

  /**
   * Reference to a field of type 'String[]'
   */
  export type ListStringFieldRefInput<$PrismaModel> = FieldRefInputType<
    $PrismaModel,
    "String[]"
  >;

  /**
   * Reference to a field of type 'Int'
   */
  export type IntFieldRefInput<$PrismaModel> = FieldRefInputType<
    $PrismaModel,
    "Int"
  >;

  /**
   * Reference to a field of type 'Int[]'
   */
  export type ListIntFieldRefInput<$PrismaModel> = FieldRefInputType<
    $PrismaModel,
    "Int[]"
  >;

  /**
   * Reference to a field of type 'DateTime'
   */
  export type DateTimeFieldRefInput<$PrismaModel> = FieldRefInputType<
    $PrismaModel,
    "DateTime"
  >;

  /**
   * Reference to a field of type 'DateTime[]'
   */
  export type ListDateTimeFieldRefInput<$PrismaModel> = FieldRefInputType<
    $PrismaModel,
    "DateTime[]"
  >;

  /**
   * Reference to a field of type 'Boolean'
   */
  export type BooleanFieldRefInput<$PrismaModel> = FieldRefInputType<
    $PrismaModel,
    "Boolean"
  >;

  /**
   * Reference to a field of type 'Json'
   */
  export type JsonFieldRefInput<$PrismaModel> = FieldRefInputType<
    $PrismaModel,
    "Json"
  >;

  /**
   * Reference to a field of type 'Bytes'
   */
  export type BytesFieldRefInput<$PrismaModel> = FieldRefInputType<
    $PrismaModel,
    "Bytes"
  >;

  /**
   * Reference to a field of type 'Bytes[]'
   */
  export type ListBytesFieldRefInput<$PrismaModel> = FieldRefInputType<
    $PrismaModel,
    "Bytes[]"
  >;

  /**
   * Reference to a field of type 'Float'
   */
  export type FloatFieldRefInput<$PrismaModel> = FieldRefInputType<
    $PrismaModel,
    "Float"
  >;

  /**
   * Reference to a field of type 'Float[]'
   */
  export type ListFloatFieldRefInput<$PrismaModel> = FieldRefInputType<
    $PrismaModel,
    "Float[]"
  >;

  /**
   * Deep Input Types
   */

  export type DriveWhereInput = {
    AND?: DriveWhereInput | DriveWhereInput[];
    OR?: DriveWhereInput[];
    NOT?: DriveWhereInput | DriveWhereInput[];
    id?: StringFilter<"Drive"> | string;
    driveDocuments?: DriveDocumentListRelationFilter;
  };

  export type DriveOrderByWithRelationInput = {
    id?: SortOrder;
    driveDocuments?: DriveDocumentOrderByRelationAggregateInput;
  };

  export type DriveWhereUniqueInput = Prisma.AtLeast<
    {
      id?: string;
      AND?: DriveWhereInput | DriveWhereInput[];
      OR?: DriveWhereInput[];
      NOT?: DriveWhereInput | DriveWhereInput[];
      driveDocuments?: DriveDocumentListRelationFilter;
    },
    "id"
  >;

  export type DriveOrderByWithAggregationInput = {
    id?: SortOrder;
    _count?: DriveCountOrderByAggregateInput;
    _max?: DriveMaxOrderByAggregateInput;
    _min?: DriveMinOrderByAggregateInput;
  };

  export type DriveScalarWhereWithAggregatesInput = {
    AND?:
      | DriveScalarWhereWithAggregatesInput
      | DriveScalarWhereWithAggregatesInput[];
    OR?: DriveScalarWhereWithAggregatesInput[];
    NOT?:
      | DriveScalarWhereWithAggregatesInput
      | DriveScalarWhereWithAggregatesInput[];
    id?: StringWithAggregatesFilter<"Drive"> | string;
  };

  export type DocumentWhereInput = {
    AND?: DocumentWhereInput | DocumentWhereInput[];
    OR?: DocumentWhereInput[];
    NOT?: DocumentWhereInput | DocumentWhereInput[];
    id?: StringFilter<"Document"> | string;
    ordinal?: IntFilter<"Document"> | number;
    created?: DateTimeFilter<"Document"> | Date | string;
    lastModified?: DateTimeFilter<"Document"> | Date | string;
    slug?: StringNullableFilter<"Document"> | string | null;
    revision?: StringFilter<"Document"> | string;
    name?: StringNullableFilter<"Document"> | string | null;
    initialState?: StringFilter<"Document"> | string;
    documentType?: StringFilter<"Document"> | string;
    meta?: StringNullableFilter<"Document"> | string | null;
    scopes?: StringNullableListFilter<"Document">;
    operations?: OperationListRelationFilter;
    synchronizationUnits?: SynchronizationUnitListRelationFilter;
  };

  export type DocumentOrderByWithRelationInput = {
    id?: SortOrder;
    ordinal?: SortOrder;
    created?: SortOrder;
    lastModified?: SortOrder;
    slug?: SortOrderInput | SortOrder;
    revision?: SortOrder;
    name?: SortOrderInput | SortOrder;
    initialState?: SortOrder;
    documentType?: SortOrder;
    meta?: SortOrderInput | SortOrder;
    scopes?: SortOrder;
    operations?: OperationOrderByRelationAggregateInput;
    synchronizationUnits?: SynchronizationUnitOrderByRelationAggregateInput;
  };

  export type DocumentWhereUniqueInput = Prisma.AtLeast<
    {
      id?: string;
      ordinal?: number;
      slug?: string;
      AND?: DocumentWhereInput | DocumentWhereInput[];
      OR?: DocumentWhereInput[];
      NOT?: DocumentWhereInput | DocumentWhereInput[];
      created?: DateTimeFilter<"Document"> | Date | string;
      lastModified?: DateTimeFilter<"Document"> | Date | string;
      revision?: StringFilter<"Document"> | string;
      name?: StringNullableFilter<"Document"> | string | null;
      initialState?: StringFilter<"Document"> | string;
      documentType?: StringFilter<"Document"> | string;
      meta?: StringNullableFilter<"Document"> | string | null;
      scopes?: StringNullableListFilter<"Document">;
      operations?: OperationListRelationFilter;
      synchronizationUnits?: SynchronizationUnitListRelationFilter;
    },
    "id" | "ordinal" | "slug"
  >;

  export type DocumentOrderByWithAggregationInput = {
    id?: SortOrder;
    ordinal?: SortOrder;
    created?: SortOrder;
    lastModified?: SortOrder;
    slug?: SortOrderInput | SortOrder;
    revision?: SortOrder;
    name?: SortOrderInput | SortOrder;
    initialState?: SortOrder;
    documentType?: SortOrder;
    meta?: SortOrderInput | SortOrder;
    scopes?: SortOrder;
    _count?: DocumentCountOrderByAggregateInput;
    _avg?: DocumentAvgOrderByAggregateInput;
    _max?: DocumentMaxOrderByAggregateInput;
    _min?: DocumentMinOrderByAggregateInput;
    _sum?: DocumentSumOrderByAggregateInput;
  };

  export type DocumentScalarWhereWithAggregatesInput = {
    AND?:
      | DocumentScalarWhereWithAggregatesInput
      | DocumentScalarWhereWithAggregatesInput[];
    OR?: DocumentScalarWhereWithAggregatesInput[];
    NOT?:
      | DocumentScalarWhereWithAggregatesInput
      | DocumentScalarWhereWithAggregatesInput[];
    id?: StringWithAggregatesFilter<"Document"> | string;
    ordinal?: IntWithAggregatesFilter<"Document"> | number;
    created?: DateTimeWithAggregatesFilter<"Document"> | Date | string;
    lastModified?: DateTimeWithAggregatesFilter<"Document"> | Date | string;
    slug?: StringNullableWithAggregatesFilter<"Document"> | string | null;
    revision?: StringWithAggregatesFilter<"Document"> | string;
    name?: StringNullableWithAggregatesFilter<"Document"> | string | null;
    initialState?: StringWithAggregatesFilter<"Document"> | string;
    documentType?: StringWithAggregatesFilter<"Document"> | string;
    meta?: StringNullableWithAggregatesFilter<"Document"> | string | null;
    scopes?: StringNullableListFilter<"Document">;
  };

  export type DriveDocumentWhereInput = {
    AND?: DriveDocumentWhereInput | DriveDocumentWhereInput[];
    OR?: DriveDocumentWhereInput[];
    NOT?: DriveDocumentWhereInput | DriveDocumentWhereInput[];
    driveId?: StringFilter<"DriveDocument"> | string;
    documentId?: StringFilter<"DriveDocument"> | string;
    drive?: XOR<DriveRelationFilter, DriveWhereInput>;
  };

  export type DriveDocumentOrderByWithRelationInput = {
    driveId?: SortOrder;
    documentId?: SortOrder;
    drive?: DriveOrderByWithRelationInput;
  };

  export type DriveDocumentWhereUniqueInput = Prisma.AtLeast<
    {
      driveId_documentId?: DriveDocumentDriveIdDocumentIdCompoundUniqueInput;
      AND?: DriveDocumentWhereInput | DriveDocumentWhereInput[];
      OR?: DriveDocumentWhereInput[];
      NOT?: DriveDocumentWhereInput | DriveDocumentWhereInput[];
      driveId?: StringFilter<"DriveDocument"> | string;
      documentId?: StringFilter<"DriveDocument"> | string;
      drive?: XOR<DriveRelationFilter, DriveWhereInput>;
    },
    "driveId_documentId"
  >;

  export type DriveDocumentOrderByWithAggregationInput = {
    driveId?: SortOrder;
    documentId?: SortOrder;
    _count?: DriveDocumentCountOrderByAggregateInput;
    _max?: DriveDocumentMaxOrderByAggregateInput;
    _min?: DriveDocumentMinOrderByAggregateInput;
  };

  export type DriveDocumentScalarWhereWithAggregatesInput = {
    AND?:
      | DriveDocumentScalarWhereWithAggregatesInput
      | DriveDocumentScalarWhereWithAggregatesInput[];
    OR?: DriveDocumentScalarWhereWithAggregatesInput[];
    NOT?:
      | DriveDocumentScalarWhereWithAggregatesInput
      | DriveDocumentScalarWhereWithAggregatesInput[];
    driveId?: StringWithAggregatesFilter<"DriveDocument"> | string;
    documentId?: StringWithAggregatesFilter<"DriveDocument"> | string;
  };

  export type OperationWhereInput = {
    AND?: OperationWhereInput | OperationWhereInput[];
    OR?: OperationWhereInput[];
    NOT?: OperationWhereInput | OperationWhereInput[];
    id?: StringFilter<"Operation"> | string;
    opId?: StringNullableFilter<"Operation"> | string | null;
    documentId?: StringFilter<"Operation"> | string;
    scope?: StringFilter<"Operation"> | string;
    branch?: StringFilter<"Operation"> | string;
    index?: IntFilter<"Operation"> | number;
    skip?: IntFilter<"Operation"> | number;
    hash?: StringFilter<"Operation"> | string;
    timestamp?: DateTimeFilter<"Operation"> | Date | string;
    actionId?: StringFilter<"Operation"> | string;
    input?: StringFilter<"Operation"> | string;
    type?: StringFilter<"Operation"> | string;
    syncId?: StringNullableFilter<"Operation"> | string | null;
    clipboard?: BoolNullableFilter<"Operation"> | boolean | null;
    context?: JsonNullableFilter<"Operation">;
    resultingState?: BytesNullableFilter<"Operation"> | Buffer | null;
    Document?: XOR<DocumentNullableRelationFilter, DocumentWhereInput> | null;
    attachments?: AttachmentListRelationFilter;
    SynchronizationUnit?: XOR<
      SynchronizationUnitNullableRelationFilter,
      SynchronizationUnitWhereInput
    > | null;
  };

  export type OperationOrderByWithRelationInput = {
    id?: SortOrder;
    opId?: SortOrderInput | SortOrder;
    documentId?: SortOrder;
    scope?: SortOrder;
    branch?: SortOrder;
    index?: SortOrder;
    skip?: SortOrder;
    hash?: SortOrder;
    timestamp?: SortOrder;
    actionId?: SortOrder;
    input?: SortOrder;
    type?: SortOrder;
    syncId?: SortOrderInput | SortOrder;
    clipboard?: SortOrderInput | SortOrder;
    context?: SortOrderInput | SortOrder;
    resultingState?: SortOrderInput | SortOrder;
    Document?: DocumentOrderByWithRelationInput;
    attachments?: AttachmentOrderByRelationAggregateInput;
    SynchronizationUnit?: SynchronizationUnitOrderByWithRelationInput;
  };

  export type OperationWhereUniqueInput = Prisma.AtLeast<
    {
      id?: string;
      unique_operation?: OperationUnique_operationCompoundUniqueInput;
      AND?: OperationWhereInput | OperationWhereInput[];
      OR?: OperationWhereInput[];
      NOT?: OperationWhereInput | OperationWhereInput[];
      opId?: StringNullableFilter<"Operation"> | string | null;
      documentId?: StringFilter<"Operation"> | string;
      scope?: StringFilter<"Operation"> | string;
      branch?: StringFilter<"Operation"> | string;
      index?: IntFilter<"Operation"> | number;
      skip?: IntFilter<"Operation"> | number;
      hash?: StringFilter<"Operation"> | string;
      timestamp?: DateTimeFilter<"Operation"> | Date | string;
      actionId?: StringFilter<"Operation"> | string;
      input?: StringFilter<"Operation"> | string;
      type?: StringFilter<"Operation"> | string;
      syncId?: StringNullableFilter<"Operation"> | string | null;
      clipboard?: BoolNullableFilter<"Operation"> | boolean | null;
      context?: JsonNullableFilter<"Operation">;
      resultingState?: BytesNullableFilter<"Operation"> | Buffer | null;
      Document?: XOR<DocumentNullableRelationFilter, DocumentWhereInput> | null;
      attachments?: AttachmentListRelationFilter;
      SynchronizationUnit?: XOR<
        SynchronizationUnitNullableRelationFilter,
        SynchronizationUnitWhereInput
      > | null;
    },
    "id" | "unique_operation"
  >;

  export type OperationOrderByWithAggregationInput = {
    id?: SortOrder;
    opId?: SortOrderInput | SortOrder;
    documentId?: SortOrder;
    scope?: SortOrder;
    branch?: SortOrder;
    index?: SortOrder;
    skip?: SortOrder;
    hash?: SortOrder;
    timestamp?: SortOrder;
    actionId?: SortOrder;
    input?: SortOrder;
    type?: SortOrder;
    syncId?: SortOrderInput | SortOrder;
    clipboard?: SortOrderInput | SortOrder;
    context?: SortOrderInput | SortOrder;
    resultingState?: SortOrderInput | SortOrder;
    _count?: OperationCountOrderByAggregateInput;
    _avg?: OperationAvgOrderByAggregateInput;
    _max?: OperationMaxOrderByAggregateInput;
    _min?: OperationMinOrderByAggregateInput;
    _sum?: OperationSumOrderByAggregateInput;
  };

  export type OperationScalarWhereWithAggregatesInput = {
    AND?:
      | OperationScalarWhereWithAggregatesInput
      | OperationScalarWhereWithAggregatesInput[];
    OR?: OperationScalarWhereWithAggregatesInput[];
    NOT?:
      | OperationScalarWhereWithAggregatesInput
      | OperationScalarWhereWithAggregatesInput[];
    id?: StringWithAggregatesFilter<"Operation"> | string;
    opId?: StringNullableWithAggregatesFilter<"Operation"> | string | null;
    documentId?: StringWithAggregatesFilter<"Operation"> | string;
    scope?: StringWithAggregatesFilter<"Operation"> | string;
    branch?: StringWithAggregatesFilter<"Operation"> | string;
    index?: IntWithAggregatesFilter<"Operation"> | number;
    skip?: IntWithAggregatesFilter<"Operation"> | number;
    hash?: StringWithAggregatesFilter<"Operation"> | string;
    timestamp?: DateTimeWithAggregatesFilter<"Operation"> | Date | string;
    actionId?: StringWithAggregatesFilter<"Operation"> | string;
    input?: StringWithAggregatesFilter<"Operation"> | string;
    type?: StringWithAggregatesFilter<"Operation"> | string;
    syncId?: StringNullableWithAggregatesFilter<"Operation"> | string | null;
    clipboard?: BoolNullableWithAggregatesFilter<"Operation"> | boolean | null;
    context?: JsonNullableWithAggregatesFilter<"Operation">;
    resultingState?:
      | BytesNullableWithAggregatesFilter<"Operation">
      | Buffer
      | null;
  };

  export type SynchronizationUnitWhereInput = {
    AND?: SynchronizationUnitWhereInput | SynchronizationUnitWhereInput[];
    OR?: SynchronizationUnitWhereInput[];
    NOT?: SynchronizationUnitWhereInput | SynchronizationUnitWhereInput[];
    id?: StringFilter<"SynchronizationUnit"> | string;
    documentId?: StringFilter<"SynchronizationUnit"> | string;
    scope?: StringFilter<"SynchronizationUnit"> | string;
    branch?: StringFilter<"SynchronizationUnit"> | string;
    Document?: XOR<DocumentRelationFilter, DocumentWhereInput>;
    operations?: OperationListRelationFilter;
  };

  export type SynchronizationUnitOrderByWithRelationInput = {
    id?: SortOrder;
    documentId?: SortOrder;
    scope?: SortOrder;
    branch?: SortOrder;
    Document?: DocumentOrderByWithRelationInput;
    operations?: OperationOrderByRelationAggregateInput;
  };

  export type SynchronizationUnitWhereUniqueInput = Prisma.AtLeast<
    {
      id?: string;
      AND?: SynchronizationUnitWhereInput | SynchronizationUnitWhereInput[];
      OR?: SynchronizationUnitWhereInput[];
      NOT?: SynchronizationUnitWhereInput | SynchronizationUnitWhereInput[];
      documentId?: StringFilter<"SynchronizationUnit"> | string;
      scope?: StringFilter<"SynchronizationUnit"> | string;
      branch?: StringFilter<"SynchronizationUnit"> | string;
      Document?: XOR<DocumentRelationFilter, DocumentWhereInput>;
      operations?: OperationListRelationFilter;
    },
    "id"
  >;

  export type SynchronizationUnitOrderByWithAggregationInput = {
    id?: SortOrder;
    documentId?: SortOrder;
    scope?: SortOrder;
    branch?: SortOrder;
    _count?: SynchronizationUnitCountOrderByAggregateInput;
    _max?: SynchronizationUnitMaxOrderByAggregateInput;
    _min?: SynchronizationUnitMinOrderByAggregateInput;
  };

  export type SynchronizationUnitScalarWhereWithAggregatesInput = {
    AND?:
      | SynchronizationUnitScalarWhereWithAggregatesInput
      | SynchronizationUnitScalarWhereWithAggregatesInput[];
    OR?: SynchronizationUnitScalarWhereWithAggregatesInput[];
    NOT?:
      | SynchronizationUnitScalarWhereWithAggregatesInput
      | SynchronizationUnitScalarWhereWithAggregatesInput[];
    id?: StringWithAggregatesFilter<"SynchronizationUnit"> | string;
    documentId?: StringWithAggregatesFilter<"SynchronizationUnit"> | string;
    scope?: StringWithAggregatesFilter<"SynchronizationUnit"> | string;
    branch?: StringWithAggregatesFilter<"SynchronizationUnit"> | string;
  };

  export type AttachmentWhereInput = {
    AND?: AttachmentWhereInput | AttachmentWhereInput[];
    OR?: AttachmentWhereInput[];
    NOT?: AttachmentWhereInput | AttachmentWhereInput[];
    id?: StringFilter<"Attachment"> | string;
    operationId?: StringFilter<"Attachment"> | string;
    mimeType?: StringFilter<"Attachment"> | string;
    data?: StringFilter<"Attachment"> | string;
    filename?: StringNullableFilter<"Attachment"> | string | null;
    extension?: StringNullableFilter<"Attachment"> | string | null;
    hash?: StringFilter<"Attachment"> | string;
    Operation?: XOR<OperationRelationFilter, OperationWhereInput>;
  };

  export type AttachmentOrderByWithRelationInput = {
    id?: SortOrder;
    operationId?: SortOrder;
    mimeType?: SortOrder;
    data?: SortOrder;
    filename?: SortOrderInput | SortOrder;
    extension?: SortOrderInput | SortOrder;
    hash?: SortOrder;
    Operation?: OperationOrderByWithRelationInput;
  };

  export type AttachmentWhereUniqueInput = Prisma.AtLeast<
    {
      id?: string;
      AND?: AttachmentWhereInput | AttachmentWhereInput[];
      OR?: AttachmentWhereInput[];
      NOT?: AttachmentWhereInput | AttachmentWhereInput[];
      operationId?: StringFilter<"Attachment"> | string;
      mimeType?: StringFilter<"Attachment"> | string;
      data?: StringFilter<"Attachment"> | string;
      filename?: StringNullableFilter<"Attachment"> | string | null;
      extension?: StringNullableFilter<"Attachment"> | string | null;
      hash?: StringFilter<"Attachment"> | string;
      Operation?: XOR<OperationRelationFilter, OperationWhereInput>;
    },
    "id"
  >;

  export type AttachmentOrderByWithAggregationInput = {
    id?: SortOrder;
    operationId?: SortOrder;
    mimeType?: SortOrder;
    data?: SortOrder;
    filename?: SortOrderInput | SortOrder;
    extension?: SortOrderInput | SortOrder;
    hash?: SortOrder;
    _count?: AttachmentCountOrderByAggregateInput;
    _max?: AttachmentMaxOrderByAggregateInput;
    _min?: AttachmentMinOrderByAggregateInput;
  };

  export type AttachmentScalarWhereWithAggregatesInput = {
    AND?:
      | AttachmentScalarWhereWithAggregatesInput
      | AttachmentScalarWhereWithAggregatesInput[];
    OR?: AttachmentScalarWhereWithAggregatesInput[];
    NOT?:
      | AttachmentScalarWhereWithAggregatesInput
      | AttachmentScalarWhereWithAggregatesInput[];
    id?: StringWithAggregatesFilter<"Attachment"> | string;
    operationId?: StringWithAggregatesFilter<"Attachment"> | string;
    mimeType?: StringWithAggregatesFilter<"Attachment"> | string;
    data?: StringWithAggregatesFilter<"Attachment"> | string;
    filename?: StringNullableWithAggregatesFilter<"Attachment"> | string | null;
    extension?:
      | StringNullableWithAggregatesFilter<"Attachment">
      | string
      | null;
    hash?: StringWithAggregatesFilter<"Attachment"> | string;
  };

  export type DriveCreateInput = {
    id: string;
    driveDocuments?: DriveDocumentCreateNestedManyWithoutDriveInput;
  };

  export type DriveUncheckedCreateInput = {
    id: string;
    driveDocuments?: DriveDocumentUncheckedCreateNestedManyWithoutDriveInput;
  };

  export type DriveUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string;
    driveDocuments?: DriveDocumentUpdateManyWithoutDriveNestedInput;
  };

  export type DriveUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string;
    driveDocuments?: DriveDocumentUncheckedUpdateManyWithoutDriveNestedInput;
  };

  export type DriveCreateManyInput = {
    id: string;
  };

  export type DriveUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string;
  };

  export type DriveUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string;
  };

  export type DocumentCreateInput = {
    id: string;
    ordinal?: number;
    created?: Date | string;
    lastModified?: Date | string;
    slug?: string | null;
    revision: string;
    name?: string | null;
    initialState: string;
    documentType: string;
    meta?: string | null;
    scopes?: DocumentCreatescopesInput | string[];
    operations?: OperationCreateNestedManyWithoutDocumentInput;
    synchronizationUnits?: SynchronizationUnitCreateNestedManyWithoutDocumentInput;
  };

  export type DocumentUncheckedCreateInput = {
    id: string;
    ordinal?: number;
    created?: Date | string;
    lastModified?: Date | string;
    slug?: string | null;
    revision: string;
    name?: string | null;
    initialState: string;
    documentType: string;
    meta?: string | null;
    scopes?: DocumentCreatescopesInput | string[];
    operations?: OperationUncheckedCreateNestedManyWithoutDocumentInput;
    synchronizationUnits?: SynchronizationUnitUncheckedCreateNestedManyWithoutDocumentInput;
  };

  export type DocumentUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string;
    created?: DateTimeFieldUpdateOperationsInput | Date | string;
    lastModified?: DateTimeFieldUpdateOperationsInput | Date | string;
    slug?: NullableStringFieldUpdateOperationsInput | string | null;
    revision?: StringFieldUpdateOperationsInput | string;
    name?: NullableStringFieldUpdateOperationsInput | string | null;
    initialState?: StringFieldUpdateOperationsInput | string;
    documentType?: StringFieldUpdateOperationsInput | string;
    meta?: NullableStringFieldUpdateOperationsInput | string | null;
    scopes?: DocumentUpdatescopesInput | string[];
    operations?: OperationUpdateManyWithoutDocumentNestedInput;
    synchronizationUnits?: SynchronizationUnitUpdateManyWithoutDocumentNestedInput;
  };

  export type DocumentUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string;
    ordinal?: IntFieldUpdateOperationsInput | number;
    created?: DateTimeFieldUpdateOperationsInput | Date | string;
    lastModified?: DateTimeFieldUpdateOperationsInput | Date | string;
    slug?: NullableStringFieldUpdateOperationsInput | string | null;
    revision?: StringFieldUpdateOperationsInput | string;
    name?: NullableStringFieldUpdateOperationsInput | string | null;
    initialState?: StringFieldUpdateOperationsInput | string;
    documentType?: StringFieldUpdateOperationsInput | string;
    meta?: NullableStringFieldUpdateOperationsInput | string | null;
    scopes?: DocumentUpdatescopesInput | string[];
    operations?: OperationUncheckedUpdateManyWithoutDocumentNestedInput;
    synchronizationUnits?: SynchronizationUnitUncheckedUpdateManyWithoutDocumentNestedInput;
  };

  export type DocumentCreateManyInput = {
    id: string;
    ordinal?: number;
    created?: Date | string;
    lastModified?: Date | string;
    slug?: string | null;
    revision: string;
    name?: string | null;
    initialState: string;
    documentType: string;
    meta?: string | null;
    scopes?: DocumentCreatescopesInput | string[];
  };

  export type DocumentUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string;
    created?: DateTimeFieldUpdateOperationsInput | Date | string;
    lastModified?: DateTimeFieldUpdateOperationsInput | Date | string;
    slug?: NullableStringFieldUpdateOperationsInput | string | null;
    revision?: StringFieldUpdateOperationsInput | string;
    name?: NullableStringFieldUpdateOperationsInput | string | null;
    initialState?: StringFieldUpdateOperationsInput | string;
    documentType?: StringFieldUpdateOperationsInput | string;
    meta?: NullableStringFieldUpdateOperationsInput | string | null;
    scopes?: DocumentUpdatescopesInput | string[];
  };

  export type DocumentUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string;
    ordinal?: IntFieldUpdateOperationsInput | number;
    created?: DateTimeFieldUpdateOperationsInput | Date | string;
    lastModified?: DateTimeFieldUpdateOperationsInput | Date | string;
    slug?: NullableStringFieldUpdateOperationsInput | string | null;
    revision?: StringFieldUpdateOperationsInput | string;
    name?: NullableStringFieldUpdateOperationsInput | string | null;
    initialState?: StringFieldUpdateOperationsInput | string;
    documentType?: StringFieldUpdateOperationsInput | string;
    meta?: NullableStringFieldUpdateOperationsInput | string | null;
    scopes?: DocumentUpdatescopesInput | string[];
  };

  export type DriveDocumentCreateInput = {
    documentId: string;
    drive: DriveCreateNestedOneWithoutDriveDocumentsInput;
  };

  export type DriveDocumentUncheckedCreateInput = {
    driveId: string;
    documentId: string;
  };

  export type DriveDocumentUpdateInput = {
    documentId?: StringFieldUpdateOperationsInput | string;
    drive?: DriveUpdateOneRequiredWithoutDriveDocumentsNestedInput;
  };

  export type DriveDocumentUncheckedUpdateInput = {
    driveId?: StringFieldUpdateOperationsInput | string;
    documentId?: StringFieldUpdateOperationsInput | string;
  };

  export type DriveDocumentCreateManyInput = {
    driveId: string;
    documentId: string;
  };

  export type DriveDocumentUpdateManyMutationInput = {
    documentId?: StringFieldUpdateOperationsInput | string;
  };

  export type DriveDocumentUncheckedUpdateManyInput = {
    driveId?: StringFieldUpdateOperationsInput | string;
    documentId?: StringFieldUpdateOperationsInput | string;
  };

  export type OperationCreateInput = {
    id?: string;
    opId?: string | null;
    scope: string;
    branch: string;
    index: number;
    skip: number;
    hash: string;
    timestamp: Date | string;
    actionId: string;
    input: string;
    type: string;
    clipboard?: boolean | null;
    context?: NullableJsonNullValueInput | InputJsonValue;
    resultingState?: Buffer | null;
    Document?: DocumentCreateNestedOneWithoutOperationsInput;
    attachments?: AttachmentCreateNestedManyWithoutOperationInput;
    SynchronizationUnit?: SynchronizationUnitCreateNestedOneWithoutOperationsInput;
  };

  export type OperationUncheckedCreateInput = {
    id?: string;
    opId?: string | null;
    documentId: string;
    scope: string;
    branch: string;
    index: number;
    skip: number;
    hash: string;
    timestamp: Date | string;
    actionId: string;
    input: string;
    type: string;
    syncId?: string | null;
    clipboard?: boolean | null;
    context?: NullableJsonNullValueInput | InputJsonValue;
    resultingState?: Buffer | null;
    attachments?: AttachmentUncheckedCreateNestedManyWithoutOperationInput;
  };

  export type OperationUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string;
    opId?: NullableStringFieldUpdateOperationsInput | string | null;
    scope?: StringFieldUpdateOperationsInput | string;
    branch?: StringFieldUpdateOperationsInput | string;
    index?: IntFieldUpdateOperationsInput | number;
    skip?: IntFieldUpdateOperationsInput | number;
    hash?: StringFieldUpdateOperationsInput | string;
    timestamp?: DateTimeFieldUpdateOperationsInput | Date | string;
    actionId?: StringFieldUpdateOperationsInput | string;
    input?: StringFieldUpdateOperationsInput | string;
    type?: StringFieldUpdateOperationsInput | string;
    clipboard?: NullableBoolFieldUpdateOperationsInput | boolean | null;
    context?: NullableJsonNullValueInput | InputJsonValue;
    resultingState?: NullableBytesFieldUpdateOperationsInput | Buffer | null;
    Document?: DocumentUpdateOneWithoutOperationsNestedInput;
    attachments?: AttachmentUpdateManyWithoutOperationNestedInput;
    SynchronizationUnit?: SynchronizationUnitUpdateOneWithoutOperationsNestedInput;
  };

  export type OperationUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string;
    opId?: NullableStringFieldUpdateOperationsInput | string | null;
    documentId?: StringFieldUpdateOperationsInput | string;
    scope?: StringFieldUpdateOperationsInput | string;
    branch?: StringFieldUpdateOperationsInput | string;
    index?: IntFieldUpdateOperationsInput | number;
    skip?: IntFieldUpdateOperationsInput | number;
    hash?: StringFieldUpdateOperationsInput | string;
    timestamp?: DateTimeFieldUpdateOperationsInput | Date | string;
    actionId?: StringFieldUpdateOperationsInput | string;
    input?: StringFieldUpdateOperationsInput | string;
    type?: StringFieldUpdateOperationsInput | string;
    syncId?: NullableStringFieldUpdateOperationsInput | string | null;
    clipboard?: NullableBoolFieldUpdateOperationsInput | boolean | null;
    context?: NullableJsonNullValueInput | InputJsonValue;
    resultingState?: NullableBytesFieldUpdateOperationsInput | Buffer | null;
    attachments?: AttachmentUncheckedUpdateManyWithoutOperationNestedInput;
  };

  export type OperationCreateManyInput = {
    id?: string;
    opId?: string | null;
    documentId: string;
    scope: string;
    branch: string;
    index: number;
    skip: number;
    hash: string;
    timestamp: Date | string;
    actionId: string;
    input: string;
    type: string;
    syncId?: string | null;
    clipboard?: boolean | null;
    context?: NullableJsonNullValueInput | InputJsonValue;
    resultingState?: Buffer | null;
  };

  export type OperationUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string;
    opId?: NullableStringFieldUpdateOperationsInput | string | null;
    scope?: StringFieldUpdateOperationsInput | string;
    branch?: StringFieldUpdateOperationsInput | string;
    index?: IntFieldUpdateOperationsInput | number;
    skip?: IntFieldUpdateOperationsInput | number;
    hash?: StringFieldUpdateOperationsInput | string;
    timestamp?: DateTimeFieldUpdateOperationsInput | Date | string;
    actionId?: StringFieldUpdateOperationsInput | string;
    input?: StringFieldUpdateOperationsInput | string;
    type?: StringFieldUpdateOperationsInput | string;
    clipboard?: NullableBoolFieldUpdateOperationsInput | boolean | null;
    context?: NullableJsonNullValueInput | InputJsonValue;
    resultingState?: NullableBytesFieldUpdateOperationsInput | Buffer | null;
  };

  export type OperationUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string;
    opId?: NullableStringFieldUpdateOperationsInput | string | null;
    documentId?: StringFieldUpdateOperationsInput | string;
    scope?: StringFieldUpdateOperationsInput | string;
    branch?: StringFieldUpdateOperationsInput | string;
    index?: IntFieldUpdateOperationsInput | number;
    skip?: IntFieldUpdateOperationsInput | number;
    hash?: StringFieldUpdateOperationsInput | string;
    timestamp?: DateTimeFieldUpdateOperationsInput | Date | string;
    actionId?: StringFieldUpdateOperationsInput | string;
    input?: StringFieldUpdateOperationsInput | string;
    type?: StringFieldUpdateOperationsInput | string;
    syncId?: NullableStringFieldUpdateOperationsInput | string | null;
    clipboard?: NullableBoolFieldUpdateOperationsInput | boolean | null;
    context?: NullableJsonNullValueInput | InputJsonValue;
    resultingState?: NullableBytesFieldUpdateOperationsInput | Buffer | null;
  };

  export type SynchronizationUnitCreateInput = {
    id: string;
    scope: string;
    branch: string;
    Document: DocumentCreateNestedOneWithoutSynchronizationUnitsInput;
    operations?: OperationCreateNestedManyWithoutSynchronizationUnitInput;
  };

  export type SynchronizationUnitUncheckedCreateInput = {
    id: string;
    documentId: string;
    scope: string;
    branch: string;
    operations?: OperationUncheckedCreateNestedManyWithoutSynchronizationUnitInput;
  };

  export type SynchronizationUnitUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string;
    scope?: StringFieldUpdateOperationsInput | string;
    branch?: StringFieldUpdateOperationsInput | string;
    Document?: DocumentUpdateOneRequiredWithoutSynchronizationUnitsNestedInput;
    operations?: OperationUpdateManyWithoutSynchronizationUnitNestedInput;
  };

  export type SynchronizationUnitUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string;
    documentId?: StringFieldUpdateOperationsInput | string;
    scope?: StringFieldUpdateOperationsInput | string;
    branch?: StringFieldUpdateOperationsInput | string;
    operations?: OperationUncheckedUpdateManyWithoutSynchronizationUnitNestedInput;
  };

  export type SynchronizationUnitCreateManyInput = {
    id: string;
    documentId: string;
    scope: string;
    branch: string;
  };

  export type SynchronizationUnitUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string;
    scope?: StringFieldUpdateOperationsInput | string;
    branch?: StringFieldUpdateOperationsInput | string;
  };

  export type SynchronizationUnitUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string;
    documentId?: StringFieldUpdateOperationsInput | string;
    scope?: StringFieldUpdateOperationsInput | string;
    branch?: StringFieldUpdateOperationsInput | string;
  };

  export type AttachmentCreateInput = {
    id?: string;
    mimeType: string;
    data: string;
    filename?: string | null;
    extension?: string | null;
    hash: string;
    Operation: OperationCreateNestedOneWithoutAttachmentsInput;
  };

  export type AttachmentUncheckedCreateInput = {
    id?: string;
    operationId: string;
    mimeType: string;
    data: string;
    filename?: string | null;
    extension?: string | null;
    hash: string;
  };

  export type AttachmentUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string;
    mimeType?: StringFieldUpdateOperationsInput | string;
    data?: StringFieldUpdateOperationsInput | string;
    filename?: NullableStringFieldUpdateOperationsInput | string | null;
    extension?: NullableStringFieldUpdateOperationsInput | string | null;
    hash?: StringFieldUpdateOperationsInput | string;
    Operation?: OperationUpdateOneRequiredWithoutAttachmentsNestedInput;
  };

  export type AttachmentUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string;
    operationId?: StringFieldUpdateOperationsInput | string;
    mimeType?: StringFieldUpdateOperationsInput | string;
    data?: StringFieldUpdateOperationsInput | string;
    filename?: NullableStringFieldUpdateOperationsInput | string | null;
    extension?: NullableStringFieldUpdateOperationsInput | string | null;
    hash?: StringFieldUpdateOperationsInput | string;
  };

  export type AttachmentCreateManyInput = {
    id?: string;
    operationId: string;
    mimeType: string;
    data: string;
    filename?: string | null;
    extension?: string | null;
    hash: string;
  };

  export type AttachmentUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string;
    mimeType?: StringFieldUpdateOperationsInput | string;
    data?: StringFieldUpdateOperationsInput | string;
    filename?: NullableStringFieldUpdateOperationsInput | string | null;
    extension?: NullableStringFieldUpdateOperationsInput | string | null;
    hash?: StringFieldUpdateOperationsInput | string;
  };

  export type AttachmentUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string;
    operationId?: StringFieldUpdateOperationsInput | string;
    mimeType?: StringFieldUpdateOperationsInput | string;
    data?: StringFieldUpdateOperationsInput | string;
    filename?: NullableStringFieldUpdateOperationsInput | string | null;
    extension?: NullableStringFieldUpdateOperationsInput | string | null;
    hash?: StringFieldUpdateOperationsInput | string;
  };

  export type StringFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>;
    in?: string[] | ListStringFieldRefInput<$PrismaModel>;
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel>;
    lt?: string | StringFieldRefInput<$PrismaModel>;
    lte?: string | StringFieldRefInput<$PrismaModel>;
    gt?: string | StringFieldRefInput<$PrismaModel>;
    gte?: string | StringFieldRefInput<$PrismaModel>;
    contains?: string | StringFieldRefInput<$PrismaModel>;
    startsWith?: string | StringFieldRefInput<$PrismaModel>;
    endsWith?: string | StringFieldRefInput<$PrismaModel>;
    mode?: QueryMode;
    not?: NestedStringFilter<$PrismaModel> | string;
  };

  export type DriveDocumentListRelationFilter = {
    every?: DriveDocumentWhereInput;
    some?: DriveDocumentWhereInput;
    none?: DriveDocumentWhereInput;
  };

  export type DriveDocumentOrderByRelationAggregateInput = {
    _count?: SortOrder;
  };

  export type DriveCountOrderByAggregateInput = {
    id?: SortOrder;
  };

  export type DriveMaxOrderByAggregateInput = {
    id?: SortOrder;
  };

  export type DriveMinOrderByAggregateInput = {
    id?: SortOrder;
  };

  export type StringWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>;
    in?: string[] | ListStringFieldRefInput<$PrismaModel>;
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel>;
    lt?: string | StringFieldRefInput<$PrismaModel>;
    lte?: string | StringFieldRefInput<$PrismaModel>;
    gt?: string | StringFieldRefInput<$PrismaModel>;
    gte?: string | StringFieldRefInput<$PrismaModel>;
    contains?: string | StringFieldRefInput<$PrismaModel>;
    startsWith?: string | StringFieldRefInput<$PrismaModel>;
    endsWith?: string | StringFieldRefInput<$PrismaModel>;
    mode?: QueryMode;
    not?: NestedStringWithAggregatesFilter<$PrismaModel> | string;
    _count?: NestedIntFilter<$PrismaModel>;
    _min?: NestedStringFilter<$PrismaModel>;
    _max?: NestedStringFilter<$PrismaModel>;
  };

  export type IntFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel>;
    in?: number[] | ListIntFieldRefInput<$PrismaModel>;
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel>;
    lt?: number | IntFieldRefInput<$PrismaModel>;
    lte?: number | IntFieldRefInput<$PrismaModel>;
    gt?: number | IntFieldRefInput<$PrismaModel>;
    gte?: number | IntFieldRefInput<$PrismaModel>;
    not?: NestedIntFilter<$PrismaModel> | number;
  };

  export type DateTimeFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>;
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>;
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>;
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>;
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>;
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>;
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>;
    not?: NestedDateTimeFilter<$PrismaModel> | Date | string;
  };

  export type StringNullableFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null;
    in?: string[] | ListStringFieldRefInput<$PrismaModel> | null;
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel> | null;
    lt?: string | StringFieldRefInput<$PrismaModel>;
    lte?: string | StringFieldRefInput<$PrismaModel>;
    gt?: string | StringFieldRefInput<$PrismaModel>;
    gte?: string | StringFieldRefInput<$PrismaModel>;
    contains?: string | StringFieldRefInput<$PrismaModel>;
    startsWith?: string | StringFieldRefInput<$PrismaModel>;
    endsWith?: string | StringFieldRefInput<$PrismaModel>;
    mode?: QueryMode;
    not?: NestedStringNullableFilter<$PrismaModel> | string | null;
  };

  export type StringNullableListFilter<$PrismaModel = never> = {
    equals?: string[] | ListStringFieldRefInput<$PrismaModel> | null;
    has?: string | StringFieldRefInput<$PrismaModel> | null;
    hasEvery?: string[] | ListStringFieldRefInput<$PrismaModel>;
    hasSome?: string[] | ListStringFieldRefInput<$PrismaModel>;
    isEmpty?: boolean;
  };

  export type OperationListRelationFilter = {
    every?: OperationWhereInput;
    some?: OperationWhereInput;
    none?: OperationWhereInput;
  };

  export type SynchronizationUnitListRelationFilter = {
    every?: SynchronizationUnitWhereInput;
    some?: SynchronizationUnitWhereInput;
    none?: SynchronizationUnitWhereInput;
  };

  export type SortOrderInput = {
    sort: SortOrder;
    nulls?: NullsOrder;
  };

  export type OperationOrderByRelationAggregateInput = {
    _count?: SortOrder;
  };

  export type SynchronizationUnitOrderByRelationAggregateInput = {
    _count?: SortOrder;
  };

  export type DocumentCountOrderByAggregateInput = {
    id?: SortOrder;
    ordinal?: SortOrder;
    created?: SortOrder;
    lastModified?: SortOrder;
    slug?: SortOrder;
    revision?: SortOrder;
    name?: SortOrder;
    initialState?: SortOrder;
    documentType?: SortOrder;
    meta?: SortOrder;
    scopes?: SortOrder;
  };

  export type DocumentAvgOrderByAggregateInput = {
    ordinal?: SortOrder;
  };

  export type DocumentMaxOrderByAggregateInput = {
    id?: SortOrder;
    ordinal?: SortOrder;
    created?: SortOrder;
    lastModified?: SortOrder;
    slug?: SortOrder;
    revision?: SortOrder;
    name?: SortOrder;
    initialState?: SortOrder;
    documentType?: SortOrder;
    meta?: SortOrder;
  };

  export type DocumentMinOrderByAggregateInput = {
    id?: SortOrder;
    ordinal?: SortOrder;
    created?: SortOrder;
    lastModified?: SortOrder;
    slug?: SortOrder;
    revision?: SortOrder;
    name?: SortOrder;
    initialState?: SortOrder;
    documentType?: SortOrder;
    meta?: SortOrder;
  };

  export type DocumentSumOrderByAggregateInput = {
    ordinal?: SortOrder;
  };

  export type IntWithAggregatesFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel>;
    in?: number[] | ListIntFieldRefInput<$PrismaModel>;
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel>;
    lt?: number | IntFieldRefInput<$PrismaModel>;
    lte?: number | IntFieldRefInput<$PrismaModel>;
    gt?: number | IntFieldRefInput<$PrismaModel>;
    gte?: number | IntFieldRefInput<$PrismaModel>;
    not?: NestedIntWithAggregatesFilter<$PrismaModel> | number;
    _count?: NestedIntFilter<$PrismaModel>;
    _avg?: NestedFloatFilter<$PrismaModel>;
    _sum?: NestedIntFilter<$PrismaModel>;
    _min?: NestedIntFilter<$PrismaModel>;
    _max?: NestedIntFilter<$PrismaModel>;
  };

  export type DateTimeWithAggregatesFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>;
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>;
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>;
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>;
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>;
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>;
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>;
    not?: NestedDateTimeWithAggregatesFilter<$PrismaModel> | Date | string;
    _count?: NestedIntFilter<$PrismaModel>;
    _min?: NestedDateTimeFilter<$PrismaModel>;
    _max?: NestedDateTimeFilter<$PrismaModel>;
  };

  export type StringNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null;
    in?: string[] | ListStringFieldRefInput<$PrismaModel> | null;
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel> | null;
    lt?: string | StringFieldRefInput<$PrismaModel>;
    lte?: string | StringFieldRefInput<$PrismaModel>;
    gt?: string | StringFieldRefInput<$PrismaModel>;
    gte?: string | StringFieldRefInput<$PrismaModel>;
    contains?: string | StringFieldRefInput<$PrismaModel>;
    startsWith?: string | StringFieldRefInput<$PrismaModel>;
    endsWith?: string | StringFieldRefInput<$PrismaModel>;
    mode?: QueryMode;
    not?:
      | NestedStringNullableWithAggregatesFilter<$PrismaModel>
      | string
      | null;
    _count?: NestedIntNullableFilter<$PrismaModel>;
    _min?: NestedStringNullableFilter<$PrismaModel>;
    _max?: NestedStringNullableFilter<$PrismaModel>;
  };

  export type DriveRelationFilter = {
    is?: DriveWhereInput;
    isNot?: DriveWhereInput;
  };

  export type DriveDocumentDriveIdDocumentIdCompoundUniqueInput = {
    driveId: string;
    documentId: string;
  };

  export type DriveDocumentCountOrderByAggregateInput = {
    driveId?: SortOrder;
    documentId?: SortOrder;
  };

  export type DriveDocumentMaxOrderByAggregateInput = {
    driveId?: SortOrder;
    documentId?: SortOrder;
  };

  export type DriveDocumentMinOrderByAggregateInput = {
    driveId?: SortOrder;
    documentId?: SortOrder;
  };

  export type BoolNullableFilter<$PrismaModel = never> = {
    equals?: boolean | BooleanFieldRefInput<$PrismaModel> | null;
    not?: NestedBoolNullableFilter<$PrismaModel> | boolean | null;
  };
  export type JsonNullableFilter<$PrismaModel = never> =
    | PatchUndefined<
        Either<
          Required<JsonNullableFilterBase<$PrismaModel>>,
          Exclude<keyof Required<JsonNullableFilterBase<$PrismaModel>>, "path">
        >,
        Required<JsonNullableFilterBase<$PrismaModel>>
      >
    | OptionalFlat<
        Omit<Required<JsonNullableFilterBase<$PrismaModel>>, "path">
      >;

  export type JsonNullableFilterBase<$PrismaModel = never> = {
    equals?:
      | InputJsonValue
      | JsonFieldRefInput<$PrismaModel>
      | JsonNullValueFilter;
    path?: string[];
    string_contains?: string | StringFieldRefInput<$PrismaModel>;
    string_starts_with?: string | StringFieldRefInput<$PrismaModel>;
    string_ends_with?: string | StringFieldRefInput<$PrismaModel>;
    array_contains?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null;
    array_starts_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null;
    array_ends_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null;
    lt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>;
    lte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>;
    gt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>;
    gte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>;
    not?:
      | InputJsonValue
      | JsonFieldRefInput<$PrismaModel>
      | JsonNullValueFilter;
  };

  export type BytesNullableFilter<$PrismaModel = never> = {
    equals?: Buffer | BytesFieldRefInput<$PrismaModel> | null;
    in?: Buffer[] | ListBytesFieldRefInput<$PrismaModel> | null;
    notIn?: Buffer[] | ListBytesFieldRefInput<$PrismaModel> | null;
    not?: NestedBytesNullableFilter<$PrismaModel> | Buffer | null;
  };

  export type DocumentNullableRelationFilter = {
    is?: DocumentWhereInput | null;
    isNot?: DocumentWhereInput | null;
  };

  export type AttachmentListRelationFilter = {
    every?: AttachmentWhereInput;
    some?: AttachmentWhereInput;
    none?: AttachmentWhereInput;
  };

  export type SynchronizationUnitNullableRelationFilter = {
    is?: SynchronizationUnitWhereInput | null;
    isNot?: SynchronizationUnitWhereInput | null;
  };

  export type AttachmentOrderByRelationAggregateInput = {
    _count?: SortOrder;
  };

  export type OperationUnique_operationCompoundUniqueInput = {
    documentId: string;
    scope: string;
    branch: string;
    index: number;
  };

  export type OperationCountOrderByAggregateInput = {
    id?: SortOrder;
    opId?: SortOrder;
    documentId?: SortOrder;
    scope?: SortOrder;
    branch?: SortOrder;
    index?: SortOrder;
    skip?: SortOrder;
    hash?: SortOrder;
    timestamp?: SortOrder;
    actionId?: SortOrder;
    input?: SortOrder;
    type?: SortOrder;
    syncId?: SortOrder;
    clipboard?: SortOrder;
    context?: SortOrder;
    resultingState?: SortOrder;
  };

  export type OperationAvgOrderByAggregateInput = {
    index?: SortOrder;
    skip?: SortOrder;
  };

  export type OperationMaxOrderByAggregateInput = {
    id?: SortOrder;
    opId?: SortOrder;
    documentId?: SortOrder;
    scope?: SortOrder;
    branch?: SortOrder;
    index?: SortOrder;
    skip?: SortOrder;
    hash?: SortOrder;
    timestamp?: SortOrder;
    actionId?: SortOrder;
    input?: SortOrder;
    type?: SortOrder;
    syncId?: SortOrder;
    clipboard?: SortOrder;
    resultingState?: SortOrder;
  };

  export type OperationMinOrderByAggregateInput = {
    id?: SortOrder;
    opId?: SortOrder;
    documentId?: SortOrder;
    scope?: SortOrder;
    branch?: SortOrder;
    index?: SortOrder;
    skip?: SortOrder;
    hash?: SortOrder;
    timestamp?: SortOrder;
    actionId?: SortOrder;
    input?: SortOrder;
    type?: SortOrder;
    syncId?: SortOrder;
    clipboard?: SortOrder;
    resultingState?: SortOrder;
  };

  export type OperationSumOrderByAggregateInput = {
    index?: SortOrder;
    skip?: SortOrder;
  };

  export type BoolNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: boolean | BooleanFieldRefInput<$PrismaModel> | null;
    not?: NestedBoolNullableWithAggregatesFilter<$PrismaModel> | boolean | null;
    _count?: NestedIntNullableFilter<$PrismaModel>;
    _min?: NestedBoolNullableFilter<$PrismaModel>;
    _max?: NestedBoolNullableFilter<$PrismaModel>;
  };
  export type JsonNullableWithAggregatesFilter<$PrismaModel = never> =
    | PatchUndefined<
        Either<
          Required<JsonNullableWithAggregatesFilterBase<$PrismaModel>>,
          Exclude<
            keyof Required<JsonNullableWithAggregatesFilterBase<$PrismaModel>>,
            "path"
          >
        >,
        Required<JsonNullableWithAggregatesFilterBase<$PrismaModel>>
      >
    | OptionalFlat<
        Omit<
          Required<JsonNullableWithAggregatesFilterBase<$PrismaModel>>,
          "path"
        >
      >;

  export type JsonNullableWithAggregatesFilterBase<$PrismaModel = never> = {
    equals?:
      | InputJsonValue
      | JsonFieldRefInput<$PrismaModel>
      | JsonNullValueFilter;
    path?: string[];
    string_contains?: string | StringFieldRefInput<$PrismaModel>;
    string_starts_with?: string | StringFieldRefInput<$PrismaModel>;
    string_ends_with?: string | StringFieldRefInput<$PrismaModel>;
    array_contains?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null;
    array_starts_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null;
    array_ends_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null;
    lt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>;
    lte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>;
    gt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>;
    gte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>;
    not?:
      | InputJsonValue
      | JsonFieldRefInput<$PrismaModel>
      | JsonNullValueFilter;
    _count?: NestedIntNullableFilter<$PrismaModel>;
    _min?: NestedJsonNullableFilter<$PrismaModel>;
    _max?: NestedJsonNullableFilter<$PrismaModel>;
  };

  export type BytesNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: Buffer | BytesFieldRefInput<$PrismaModel> | null;
    in?: Buffer[] | ListBytesFieldRefInput<$PrismaModel> | null;
    notIn?: Buffer[] | ListBytesFieldRefInput<$PrismaModel> | null;
    not?: NestedBytesNullableWithAggregatesFilter<$PrismaModel> | Buffer | null;
    _count?: NestedIntNullableFilter<$PrismaModel>;
    _min?: NestedBytesNullableFilter<$PrismaModel>;
    _max?: NestedBytesNullableFilter<$PrismaModel>;
  };

  export type DocumentRelationFilter = {
    is?: DocumentWhereInput;
    isNot?: DocumentWhereInput;
  };

  export type SynchronizationUnitCountOrderByAggregateInput = {
    id?: SortOrder;
    documentId?: SortOrder;
    scope?: SortOrder;
    branch?: SortOrder;
  };

  export type SynchronizationUnitMaxOrderByAggregateInput = {
    id?: SortOrder;
    documentId?: SortOrder;
    scope?: SortOrder;
    branch?: SortOrder;
  };

  export type SynchronizationUnitMinOrderByAggregateInput = {
    id?: SortOrder;
    documentId?: SortOrder;
    scope?: SortOrder;
    branch?: SortOrder;
  };

  export type OperationRelationFilter = {
    is?: OperationWhereInput;
    isNot?: OperationWhereInput;
  };

  export type AttachmentCountOrderByAggregateInput = {
    id?: SortOrder;
    operationId?: SortOrder;
    mimeType?: SortOrder;
    data?: SortOrder;
    filename?: SortOrder;
    extension?: SortOrder;
    hash?: SortOrder;
  };

  export type AttachmentMaxOrderByAggregateInput = {
    id?: SortOrder;
    operationId?: SortOrder;
    mimeType?: SortOrder;
    data?: SortOrder;
    filename?: SortOrder;
    extension?: SortOrder;
    hash?: SortOrder;
  };

  export type AttachmentMinOrderByAggregateInput = {
    id?: SortOrder;
    operationId?: SortOrder;
    mimeType?: SortOrder;
    data?: SortOrder;
    filename?: SortOrder;
    extension?: SortOrder;
    hash?: SortOrder;
  };

  export type DriveDocumentCreateNestedManyWithoutDriveInput = {
    create?:
      | XOR<
          DriveDocumentCreateWithoutDriveInput,
          DriveDocumentUncheckedCreateWithoutDriveInput
        >
      | DriveDocumentCreateWithoutDriveInput[]
      | DriveDocumentUncheckedCreateWithoutDriveInput[];
    connectOrCreate?:
      | DriveDocumentCreateOrConnectWithoutDriveInput
      | DriveDocumentCreateOrConnectWithoutDriveInput[];
    createMany?: DriveDocumentCreateManyDriveInputEnvelope;
    connect?: DriveDocumentWhereUniqueInput | DriveDocumentWhereUniqueInput[];
  };

  export type DriveDocumentUncheckedCreateNestedManyWithoutDriveInput = {
    create?:
      | XOR<
          DriveDocumentCreateWithoutDriveInput,
          DriveDocumentUncheckedCreateWithoutDriveInput
        >
      | DriveDocumentCreateWithoutDriveInput[]
      | DriveDocumentUncheckedCreateWithoutDriveInput[];
    connectOrCreate?:
      | DriveDocumentCreateOrConnectWithoutDriveInput
      | DriveDocumentCreateOrConnectWithoutDriveInput[];
    createMany?: DriveDocumentCreateManyDriveInputEnvelope;
    connect?: DriveDocumentWhereUniqueInput | DriveDocumentWhereUniqueInput[];
  };

  export type StringFieldUpdateOperationsInput = {
    set?: string;
  };

  export type DriveDocumentUpdateManyWithoutDriveNestedInput = {
    create?:
      | XOR<
          DriveDocumentCreateWithoutDriveInput,
          DriveDocumentUncheckedCreateWithoutDriveInput
        >
      | DriveDocumentCreateWithoutDriveInput[]
      | DriveDocumentUncheckedCreateWithoutDriveInput[];
    connectOrCreate?:
      | DriveDocumentCreateOrConnectWithoutDriveInput
      | DriveDocumentCreateOrConnectWithoutDriveInput[];
    upsert?:
      | DriveDocumentUpsertWithWhereUniqueWithoutDriveInput
      | DriveDocumentUpsertWithWhereUniqueWithoutDriveInput[];
    createMany?: DriveDocumentCreateManyDriveInputEnvelope;
    set?: DriveDocumentWhereUniqueInput | DriveDocumentWhereUniqueInput[];
    disconnect?:
      | DriveDocumentWhereUniqueInput
      | DriveDocumentWhereUniqueInput[];
    delete?: DriveDocumentWhereUniqueInput | DriveDocumentWhereUniqueInput[];
    connect?: DriveDocumentWhereUniqueInput | DriveDocumentWhereUniqueInput[];
    update?:
      | DriveDocumentUpdateWithWhereUniqueWithoutDriveInput
      | DriveDocumentUpdateWithWhereUniqueWithoutDriveInput[];
    updateMany?:
      | DriveDocumentUpdateManyWithWhereWithoutDriveInput
      | DriveDocumentUpdateManyWithWhereWithoutDriveInput[];
    deleteMany?:
      | DriveDocumentScalarWhereInput
      | DriveDocumentScalarWhereInput[];
  };

  export type DriveDocumentUncheckedUpdateManyWithoutDriveNestedInput = {
    create?:
      | XOR<
          DriveDocumentCreateWithoutDriveInput,
          DriveDocumentUncheckedCreateWithoutDriveInput
        >
      | DriveDocumentCreateWithoutDriveInput[]
      | DriveDocumentUncheckedCreateWithoutDriveInput[];
    connectOrCreate?:
      | DriveDocumentCreateOrConnectWithoutDriveInput
      | DriveDocumentCreateOrConnectWithoutDriveInput[];
    upsert?:
      | DriveDocumentUpsertWithWhereUniqueWithoutDriveInput
      | DriveDocumentUpsertWithWhereUniqueWithoutDriveInput[];
    createMany?: DriveDocumentCreateManyDriveInputEnvelope;
    set?: DriveDocumentWhereUniqueInput | DriveDocumentWhereUniqueInput[];
    disconnect?:
      | DriveDocumentWhereUniqueInput
      | DriveDocumentWhereUniqueInput[];
    delete?: DriveDocumentWhereUniqueInput | DriveDocumentWhereUniqueInput[];
    connect?: DriveDocumentWhereUniqueInput | DriveDocumentWhereUniqueInput[];
    update?:
      | DriveDocumentUpdateWithWhereUniqueWithoutDriveInput
      | DriveDocumentUpdateWithWhereUniqueWithoutDriveInput[];
    updateMany?:
      | DriveDocumentUpdateManyWithWhereWithoutDriveInput
      | DriveDocumentUpdateManyWithWhereWithoutDriveInput[];
    deleteMany?:
      | DriveDocumentScalarWhereInput
      | DriveDocumentScalarWhereInput[];
  };

  export type DocumentCreatescopesInput = {
    set: string[];
  };

  export type OperationCreateNestedManyWithoutDocumentInput = {
    create?:
      | XOR<
          OperationCreateWithoutDocumentInput,
          OperationUncheckedCreateWithoutDocumentInput
        >
      | OperationCreateWithoutDocumentInput[]
      | OperationUncheckedCreateWithoutDocumentInput[];
    connectOrCreate?:
      | OperationCreateOrConnectWithoutDocumentInput
      | OperationCreateOrConnectWithoutDocumentInput[];
    createMany?: OperationCreateManyDocumentInputEnvelope;
    connect?: OperationWhereUniqueInput | OperationWhereUniqueInput[];
  };

  export type SynchronizationUnitCreateNestedManyWithoutDocumentInput = {
    create?:
      | XOR<
          SynchronizationUnitCreateWithoutDocumentInput,
          SynchronizationUnitUncheckedCreateWithoutDocumentInput
        >
      | SynchronizationUnitCreateWithoutDocumentInput[]
      | SynchronizationUnitUncheckedCreateWithoutDocumentInput[];
    connectOrCreate?:
      | SynchronizationUnitCreateOrConnectWithoutDocumentInput
      | SynchronizationUnitCreateOrConnectWithoutDocumentInput[];
    createMany?: SynchronizationUnitCreateManyDocumentInputEnvelope;
    connect?:
      | SynchronizationUnitWhereUniqueInput
      | SynchronizationUnitWhereUniqueInput[];
  };

  export type OperationUncheckedCreateNestedManyWithoutDocumentInput = {
    create?:
      | XOR<
          OperationCreateWithoutDocumentInput,
          OperationUncheckedCreateWithoutDocumentInput
        >
      | OperationCreateWithoutDocumentInput[]
      | OperationUncheckedCreateWithoutDocumentInput[];
    connectOrCreate?:
      | OperationCreateOrConnectWithoutDocumentInput
      | OperationCreateOrConnectWithoutDocumentInput[];
    createMany?: OperationCreateManyDocumentInputEnvelope;
    connect?: OperationWhereUniqueInput | OperationWhereUniqueInput[];
  };

  export type SynchronizationUnitUncheckedCreateNestedManyWithoutDocumentInput =
    {
      create?:
        | XOR<
            SynchronizationUnitCreateWithoutDocumentInput,
            SynchronizationUnitUncheckedCreateWithoutDocumentInput
          >
        | SynchronizationUnitCreateWithoutDocumentInput[]
        | SynchronizationUnitUncheckedCreateWithoutDocumentInput[];
      connectOrCreate?:
        | SynchronizationUnitCreateOrConnectWithoutDocumentInput
        | SynchronizationUnitCreateOrConnectWithoutDocumentInput[];
      createMany?: SynchronizationUnitCreateManyDocumentInputEnvelope;
      connect?:
        | SynchronizationUnitWhereUniqueInput
        | SynchronizationUnitWhereUniqueInput[];
    };

  export type DateTimeFieldUpdateOperationsInput = {
    set?: Date | string;
  };

  export type NullableStringFieldUpdateOperationsInput = {
    set?: string | null;
  };

  export type DocumentUpdatescopesInput = {
    set?: string[];
    push?: string | string[];
  };

  export type OperationUpdateManyWithoutDocumentNestedInput = {
    create?:
      | XOR<
          OperationCreateWithoutDocumentInput,
          OperationUncheckedCreateWithoutDocumentInput
        >
      | OperationCreateWithoutDocumentInput[]
      | OperationUncheckedCreateWithoutDocumentInput[];
    connectOrCreate?:
      | OperationCreateOrConnectWithoutDocumentInput
      | OperationCreateOrConnectWithoutDocumentInput[];
    upsert?:
      | OperationUpsertWithWhereUniqueWithoutDocumentInput
      | OperationUpsertWithWhereUniqueWithoutDocumentInput[];
    createMany?: OperationCreateManyDocumentInputEnvelope;
    set?: OperationWhereUniqueInput | OperationWhereUniqueInput[];
    disconnect?: OperationWhereUniqueInput | OperationWhereUniqueInput[];
    delete?: OperationWhereUniqueInput | OperationWhereUniqueInput[];
    connect?: OperationWhereUniqueInput | OperationWhereUniqueInput[];
    update?:
      | OperationUpdateWithWhereUniqueWithoutDocumentInput
      | OperationUpdateWithWhereUniqueWithoutDocumentInput[];
    updateMany?:
      | OperationUpdateManyWithWhereWithoutDocumentInput
      | OperationUpdateManyWithWhereWithoutDocumentInput[];
    deleteMany?: OperationScalarWhereInput | OperationScalarWhereInput[];
  };

  export type SynchronizationUnitUpdateManyWithoutDocumentNestedInput = {
    create?:
      | XOR<
          SynchronizationUnitCreateWithoutDocumentInput,
          SynchronizationUnitUncheckedCreateWithoutDocumentInput
        >
      | SynchronizationUnitCreateWithoutDocumentInput[]
      | SynchronizationUnitUncheckedCreateWithoutDocumentInput[];
    connectOrCreate?:
      | SynchronizationUnitCreateOrConnectWithoutDocumentInput
      | SynchronizationUnitCreateOrConnectWithoutDocumentInput[];
    upsert?:
      | SynchronizationUnitUpsertWithWhereUniqueWithoutDocumentInput
      | SynchronizationUnitUpsertWithWhereUniqueWithoutDocumentInput[];
    createMany?: SynchronizationUnitCreateManyDocumentInputEnvelope;
    set?:
      | SynchronizationUnitWhereUniqueInput
      | SynchronizationUnitWhereUniqueInput[];
    disconnect?:
      | SynchronizationUnitWhereUniqueInput
      | SynchronizationUnitWhereUniqueInput[];
    delete?:
      | SynchronizationUnitWhereUniqueInput
      | SynchronizationUnitWhereUniqueInput[];
    connect?:
      | SynchronizationUnitWhereUniqueInput
      | SynchronizationUnitWhereUniqueInput[];
    update?:
      | SynchronizationUnitUpdateWithWhereUniqueWithoutDocumentInput
      | SynchronizationUnitUpdateWithWhereUniqueWithoutDocumentInput[];
    updateMany?:
      | SynchronizationUnitUpdateManyWithWhereWithoutDocumentInput
      | SynchronizationUnitUpdateManyWithWhereWithoutDocumentInput[];
    deleteMany?:
      | SynchronizationUnitScalarWhereInput
      | SynchronizationUnitScalarWhereInput[];
  };

  export type IntFieldUpdateOperationsInput = {
    set?: number;
    increment?: number;
    decrement?: number;
    multiply?: number;
    divide?: number;
  };

  export type OperationUncheckedUpdateManyWithoutDocumentNestedInput = {
    create?:
      | XOR<
          OperationCreateWithoutDocumentInput,
          OperationUncheckedCreateWithoutDocumentInput
        >
      | OperationCreateWithoutDocumentInput[]
      | OperationUncheckedCreateWithoutDocumentInput[];
    connectOrCreate?:
      | OperationCreateOrConnectWithoutDocumentInput
      | OperationCreateOrConnectWithoutDocumentInput[];
    upsert?:
      | OperationUpsertWithWhereUniqueWithoutDocumentInput
      | OperationUpsertWithWhereUniqueWithoutDocumentInput[];
    createMany?: OperationCreateManyDocumentInputEnvelope;
    set?: OperationWhereUniqueInput | OperationWhereUniqueInput[];
    disconnect?: OperationWhereUniqueInput | OperationWhereUniqueInput[];
    delete?: OperationWhereUniqueInput | OperationWhereUniqueInput[];
    connect?: OperationWhereUniqueInput | OperationWhereUniqueInput[];
    update?:
      | OperationUpdateWithWhereUniqueWithoutDocumentInput
      | OperationUpdateWithWhereUniqueWithoutDocumentInput[];
    updateMany?:
      | OperationUpdateManyWithWhereWithoutDocumentInput
      | OperationUpdateManyWithWhereWithoutDocumentInput[];
    deleteMany?: OperationScalarWhereInput | OperationScalarWhereInput[];
  };

  export type SynchronizationUnitUncheckedUpdateManyWithoutDocumentNestedInput =
    {
      create?:
        | XOR<
            SynchronizationUnitCreateWithoutDocumentInput,
            SynchronizationUnitUncheckedCreateWithoutDocumentInput
          >
        | SynchronizationUnitCreateWithoutDocumentInput[]
        | SynchronizationUnitUncheckedCreateWithoutDocumentInput[];
      connectOrCreate?:
        | SynchronizationUnitCreateOrConnectWithoutDocumentInput
        | SynchronizationUnitCreateOrConnectWithoutDocumentInput[];
      upsert?:
        | SynchronizationUnitUpsertWithWhereUniqueWithoutDocumentInput
        | SynchronizationUnitUpsertWithWhereUniqueWithoutDocumentInput[];
      createMany?: SynchronizationUnitCreateManyDocumentInputEnvelope;
      set?:
        | SynchronizationUnitWhereUniqueInput
        | SynchronizationUnitWhereUniqueInput[];
      disconnect?:
        | SynchronizationUnitWhereUniqueInput
        | SynchronizationUnitWhereUniqueInput[];
      delete?:
        | SynchronizationUnitWhereUniqueInput
        | SynchronizationUnitWhereUniqueInput[];
      connect?:
        | SynchronizationUnitWhereUniqueInput
        | SynchronizationUnitWhereUniqueInput[];
      update?:
        | SynchronizationUnitUpdateWithWhereUniqueWithoutDocumentInput
        | SynchronizationUnitUpdateWithWhereUniqueWithoutDocumentInput[];
      updateMany?:
        | SynchronizationUnitUpdateManyWithWhereWithoutDocumentInput
        | SynchronizationUnitUpdateManyWithWhereWithoutDocumentInput[];
      deleteMany?:
        | SynchronizationUnitScalarWhereInput
        | SynchronizationUnitScalarWhereInput[];
    };

  export type DriveCreateNestedOneWithoutDriveDocumentsInput = {
    create?: XOR<
      DriveCreateWithoutDriveDocumentsInput,
      DriveUncheckedCreateWithoutDriveDocumentsInput
    >;
    connectOrCreate?: DriveCreateOrConnectWithoutDriveDocumentsInput;
    connect?: DriveWhereUniqueInput;
  };

  export type DriveUpdateOneRequiredWithoutDriveDocumentsNestedInput = {
    create?: XOR<
      DriveCreateWithoutDriveDocumentsInput,
      DriveUncheckedCreateWithoutDriveDocumentsInput
    >;
    connectOrCreate?: DriveCreateOrConnectWithoutDriveDocumentsInput;
    upsert?: DriveUpsertWithoutDriveDocumentsInput;
    connect?: DriveWhereUniqueInput;
    update?: XOR<
      XOR<
        DriveUpdateToOneWithWhereWithoutDriveDocumentsInput,
        DriveUpdateWithoutDriveDocumentsInput
      >,
      DriveUncheckedUpdateWithoutDriveDocumentsInput
    >;
  };

  export type DocumentCreateNestedOneWithoutOperationsInput = {
    create?: XOR<
      DocumentCreateWithoutOperationsInput,
      DocumentUncheckedCreateWithoutOperationsInput
    >;
    connectOrCreate?: DocumentCreateOrConnectWithoutOperationsInput;
    connect?: DocumentWhereUniqueInput;
  };

  export type AttachmentCreateNestedManyWithoutOperationInput = {
    create?:
      | XOR<
          AttachmentCreateWithoutOperationInput,
          AttachmentUncheckedCreateWithoutOperationInput
        >
      | AttachmentCreateWithoutOperationInput[]
      | AttachmentUncheckedCreateWithoutOperationInput[];
    connectOrCreate?:
      | AttachmentCreateOrConnectWithoutOperationInput
      | AttachmentCreateOrConnectWithoutOperationInput[];
    createMany?: AttachmentCreateManyOperationInputEnvelope;
    connect?: AttachmentWhereUniqueInput | AttachmentWhereUniqueInput[];
  };

  export type SynchronizationUnitCreateNestedOneWithoutOperationsInput = {
    create?: XOR<
      SynchronizationUnitCreateWithoutOperationsInput,
      SynchronizationUnitUncheckedCreateWithoutOperationsInput
    >;
    connectOrCreate?: SynchronizationUnitCreateOrConnectWithoutOperationsInput;
    connect?: SynchronizationUnitWhereUniqueInput;
  };

  export type AttachmentUncheckedCreateNestedManyWithoutOperationInput = {
    create?:
      | XOR<
          AttachmentCreateWithoutOperationInput,
          AttachmentUncheckedCreateWithoutOperationInput
        >
      | AttachmentCreateWithoutOperationInput[]
      | AttachmentUncheckedCreateWithoutOperationInput[];
    connectOrCreate?:
      | AttachmentCreateOrConnectWithoutOperationInput
      | AttachmentCreateOrConnectWithoutOperationInput[];
    createMany?: AttachmentCreateManyOperationInputEnvelope;
    connect?: AttachmentWhereUniqueInput | AttachmentWhereUniqueInput[];
  };

  export type NullableBoolFieldUpdateOperationsInput = {
    set?: boolean | null;
  };

  export type NullableBytesFieldUpdateOperationsInput = {
    set?: Buffer | null;
  };

  export type DocumentUpdateOneWithoutOperationsNestedInput = {
    create?: XOR<
      DocumentCreateWithoutOperationsInput,
      DocumentUncheckedCreateWithoutOperationsInput
    >;
    connectOrCreate?: DocumentCreateOrConnectWithoutOperationsInput;
    upsert?: DocumentUpsertWithoutOperationsInput;
    disconnect?: DocumentWhereInput | boolean;
    delete?: DocumentWhereInput | boolean;
    connect?: DocumentWhereUniqueInput;
    update?: XOR<
      XOR<
        DocumentUpdateToOneWithWhereWithoutOperationsInput,
        DocumentUpdateWithoutOperationsInput
      >,
      DocumentUncheckedUpdateWithoutOperationsInput
    >;
  };

  export type AttachmentUpdateManyWithoutOperationNestedInput = {
    create?:
      | XOR<
          AttachmentCreateWithoutOperationInput,
          AttachmentUncheckedCreateWithoutOperationInput
        >
      | AttachmentCreateWithoutOperationInput[]
      | AttachmentUncheckedCreateWithoutOperationInput[];
    connectOrCreate?:
      | AttachmentCreateOrConnectWithoutOperationInput
      | AttachmentCreateOrConnectWithoutOperationInput[];
    upsert?:
      | AttachmentUpsertWithWhereUniqueWithoutOperationInput
      | AttachmentUpsertWithWhereUniqueWithoutOperationInput[];
    createMany?: AttachmentCreateManyOperationInputEnvelope;
    set?: AttachmentWhereUniqueInput | AttachmentWhereUniqueInput[];
    disconnect?: AttachmentWhereUniqueInput | AttachmentWhereUniqueInput[];
    delete?: AttachmentWhereUniqueInput | AttachmentWhereUniqueInput[];
    connect?: AttachmentWhereUniqueInput | AttachmentWhereUniqueInput[];
    update?:
      | AttachmentUpdateWithWhereUniqueWithoutOperationInput
      | AttachmentUpdateWithWhereUniqueWithoutOperationInput[];
    updateMany?:
      | AttachmentUpdateManyWithWhereWithoutOperationInput
      | AttachmentUpdateManyWithWhereWithoutOperationInput[];
    deleteMany?: AttachmentScalarWhereInput | AttachmentScalarWhereInput[];
  };

  export type SynchronizationUnitUpdateOneWithoutOperationsNestedInput = {
    create?: XOR<
      SynchronizationUnitCreateWithoutOperationsInput,
      SynchronizationUnitUncheckedCreateWithoutOperationsInput
    >;
    connectOrCreate?: SynchronizationUnitCreateOrConnectWithoutOperationsInput;
    upsert?: SynchronizationUnitUpsertWithoutOperationsInput;
    disconnect?: SynchronizationUnitWhereInput | boolean;
    delete?: SynchronizationUnitWhereInput | boolean;
    connect?: SynchronizationUnitWhereUniqueInput;
    update?: XOR<
      XOR<
        SynchronizationUnitUpdateToOneWithWhereWithoutOperationsInput,
        SynchronizationUnitUpdateWithoutOperationsInput
      >,
      SynchronizationUnitUncheckedUpdateWithoutOperationsInput
    >;
  };

  export type AttachmentUncheckedUpdateManyWithoutOperationNestedInput = {
    create?:
      | XOR<
          AttachmentCreateWithoutOperationInput,
          AttachmentUncheckedCreateWithoutOperationInput
        >
      | AttachmentCreateWithoutOperationInput[]
      | AttachmentUncheckedCreateWithoutOperationInput[];
    connectOrCreate?:
      | AttachmentCreateOrConnectWithoutOperationInput
      | AttachmentCreateOrConnectWithoutOperationInput[];
    upsert?:
      | AttachmentUpsertWithWhereUniqueWithoutOperationInput
      | AttachmentUpsertWithWhereUniqueWithoutOperationInput[];
    createMany?: AttachmentCreateManyOperationInputEnvelope;
    set?: AttachmentWhereUniqueInput | AttachmentWhereUniqueInput[];
    disconnect?: AttachmentWhereUniqueInput | AttachmentWhereUniqueInput[];
    delete?: AttachmentWhereUniqueInput | AttachmentWhereUniqueInput[];
    connect?: AttachmentWhereUniqueInput | AttachmentWhereUniqueInput[];
    update?:
      | AttachmentUpdateWithWhereUniqueWithoutOperationInput
      | AttachmentUpdateWithWhereUniqueWithoutOperationInput[];
    updateMany?:
      | AttachmentUpdateManyWithWhereWithoutOperationInput
      | AttachmentUpdateManyWithWhereWithoutOperationInput[];
    deleteMany?: AttachmentScalarWhereInput | AttachmentScalarWhereInput[];
  };

  export type DocumentCreateNestedOneWithoutSynchronizationUnitsInput = {
    create?: XOR<
      DocumentCreateWithoutSynchronizationUnitsInput,
      DocumentUncheckedCreateWithoutSynchronizationUnitsInput
    >;
    connectOrCreate?: DocumentCreateOrConnectWithoutSynchronizationUnitsInput;
    connect?: DocumentWhereUniqueInput;
  };

  export type OperationCreateNestedManyWithoutSynchronizationUnitInput = {
    create?:
      | XOR<
          OperationCreateWithoutSynchronizationUnitInput,
          OperationUncheckedCreateWithoutSynchronizationUnitInput
        >
      | OperationCreateWithoutSynchronizationUnitInput[]
      | OperationUncheckedCreateWithoutSynchronizationUnitInput[];
    connectOrCreate?:
      | OperationCreateOrConnectWithoutSynchronizationUnitInput
      | OperationCreateOrConnectWithoutSynchronizationUnitInput[];
    createMany?: OperationCreateManySynchronizationUnitInputEnvelope;
    connect?: OperationWhereUniqueInput | OperationWhereUniqueInput[];
  };

  export type OperationUncheckedCreateNestedManyWithoutSynchronizationUnitInput =
    {
      create?:
        | XOR<
            OperationCreateWithoutSynchronizationUnitInput,
            OperationUncheckedCreateWithoutSynchronizationUnitInput
          >
        | OperationCreateWithoutSynchronizationUnitInput[]
        | OperationUncheckedCreateWithoutSynchronizationUnitInput[];
      connectOrCreate?:
        | OperationCreateOrConnectWithoutSynchronizationUnitInput
        | OperationCreateOrConnectWithoutSynchronizationUnitInput[];
      createMany?: OperationCreateManySynchronizationUnitInputEnvelope;
      connect?: OperationWhereUniqueInput | OperationWhereUniqueInput[];
    };

  export type DocumentUpdateOneRequiredWithoutSynchronizationUnitsNestedInput =
    {
      create?: XOR<
        DocumentCreateWithoutSynchronizationUnitsInput,
        DocumentUncheckedCreateWithoutSynchronizationUnitsInput
      >;
      connectOrCreate?: DocumentCreateOrConnectWithoutSynchronizationUnitsInput;
      upsert?: DocumentUpsertWithoutSynchronizationUnitsInput;
      connect?: DocumentWhereUniqueInput;
      update?: XOR<
        XOR<
          DocumentUpdateToOneWithWhereWithoutSynchronizationUnitsInput,
          DocumentUpdateWithoutSynchronizationUnitsInput
        >,
        DocumentUncheckedUpdateWithoutSynchronizationUnitsInput
      >;
    };

  export type OperationUpdateManyWithoutSynchronizationUnitNestedInput = {
    create?:
      | XOR<
          OperationCreateWithoutSynchronizationUnitInput,
          OperationUncheckedCreateWithoutSynchronizationUnitInput
        >
      | OperationCreateWithoutSynchronizationUnitInput[]
      | OperationUncheckedCreateWithoutSynchronizationUnitInput[];
    connectOrCreate?:
      | OperationCreateOrConnectWithoutSynchronizationUnitInput
      | OperationCreateOrConnectWithoutSynchronizationUnitInput[];
    upsert?:
      | OperationUpsertWithWhereUniqueWithoutSynchronizationUnitInput
      | OperationUpsertWithWhereUniqueWithoutSynchronizationUnitInput[];
    createMany?: OperationCreateManySynchronizationUnitInputEnvelope;
    set?: OperationWhereUniqueInput | OperationWhereUniqueInput[];
    disconnect?: OperationWhereUniqueInput | OperationWhereUniqueInput[];
    delete?: OperationWhereUniqueInput | OperationWhereUniqueInput[];
    connect?: OperationWhereUniqueInput | OperationWhereUniqueInput[];
    update?:
      | OperationUpdateWithWhereUniqueWithoutSynchronizationUnitInput
      | OperationUpdateWithWhereUniqueWithoutSynchronizationUnitInput[];
    updateMany?:
      | OperationUpdateManyWithWhereWithoutSynchronizationUnitInput
      | OperationUpdateManyWithWhereWithoutSynchronizationUnitInput[];
    deleteMany?: OperationScalarWhereInput | OperationScalarWhereInput[];
  };

  export type OperationUncheckedUpdateManyWithoutSynchronizationUnitNestedInput =
    {
      create?:
        | XOR<
            OperationCreateWithoutSynchronizationUnitInput,
            OperationUncheckedCreateWithoutSynchronizationUnitInput
          >
        | OperationCreateWithoutSynchronizationUnitInput[]
        | OperationUncheckedCreateWithoutSynchronizationUnitInput[];
      connectOrCreate?:
        | OperationCreateOrConnectWithoutSynchronizationUnitInput
        | OperationCreateOrConnectWithoutSynchronizationUnitInput[];
      upsert?:
        | OperationUpsertWithWhereUniqueWithoutSynchronizationUnitInput
        | OperationUpsertWithWhereUniqueWithoutSynchronizationUnitInput[];
      createMany?: OperationCreateManySynchronizationUnitInputEnvelope;
      set?: OperationWhereUniqueInput | OperationWhereUniqueInput[];
      disconnect?: OperationWhereUniqueInput | OperationWhereUniqueInput[];
      delete?: OperationWhereUniqueInput | OperationWhereUniqueInput[];
      connect?: OperationWhereUniqueInput | OperationWhereUniqueInput[];
      update?:
        | OperationUpdateWithWhereUniqueWithoutSynchronizationUnitInput
        | OperationUpdateWithWhereUniqueWithoutSynchronizationUnitInput[];
      updateMany?:
        | OperationUpdateManyWithWhereWithoutSynchronizationUnitInput
        | OperationUpdateManyWithWhereWithoutSynchronizationUnitInput[];
      deleteMany?: OperationScalarWhereInput | OperationScalarWhereInput[];
    };

  export type OperationCreateNestedOneWithoutAttachmentsInput = {
    create?: XOR<
      OperationCreateWithoutAttachmentsInput,
      OperationUncheckedCreateWithoutAttachmentsInput
    >;
    connectOrCreate?: OperationCreateOrConnectWithoutAttachmentsInput;
    connect?: OperationWhereUniqueInput;
  };

  export type OperationUpdateOneRequiredWithoutAttachmentsNestedInput = {
    create?: XOR<
      OperationCreateWithoutAttachmentsInput,
      OperationUncheckedCreateWithoutAttachmentsInput
    >;
    connectOrCreate?: OperationCreateOrConnectWithoutAttachmentsInput;
    upsert?: OperationUpsertWithoutAttachmentsInput;
    connect?: OperationWhereUniqueInput;
    update?: XOR<
      XOR<
        OperationUpdateToOneWithWhereWithoutAttachmentsInput,
        OperationUpdateWithoutAttachmentsInput
      >,
      OperationUncheckedUpdateWithoutAttachmentsInput
    >;
  };

  export type NestedStringFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>;
    in?: string[] | ListStringFieldRefInput<$PrismaModel>;
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel>;
    lt?: string | StringFieldRefInput<$PrismaModel>;
    lte?: string | StringFieldRefInput<$PrismaModel>;
    gt?: string | StringFieldRefInput<$PrismaModel>;
    gte?: string | StringFieldRefInput<$PrismaModel>;
    contains?: string | StringFieldRefInput<$PrismaModel>;
    startsWith?: string | StringFieldRefInput<$PrismaModel>;
    endsWith?: string | StringFieldRefInput<$PrismaModel>;
    not?: NestedStringFilter<$PrismaModel> | string;
  };

  export type NestedStringWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>;
    in?: string[] | ListStringFieldRefInput<$PrismaModel>;
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel>;
    lt?: string | StringFieldRefInput<$PrismaModel>;
    lte?: string | StringFieldRefInput<$PrismaModel>;
    gt?: string | StringFieldRefInput<$PrismaModel>;
    gte?: string | StringFieldRefInput<$PrismaModel>;
    contains?: string | StringFieldRefInput<$PrismaModel>;
    startsWith?: string | StringFieldRefInput<$PrismaModel>;
    endsWith?: string | StringFieldRefInput<$PrismaModel>;
    not?: NestedStringWithAggregatesFilter<$PrismaModel> | string;
    _count?: NestedIntFilter<$PrismaModel>;
    _min?: NestedStringFilter<$PrismaModel>;
    _max?: NestedStringFilter<$PrismaModel>;
  };

  export type NestedIntFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel>;
    in?: number[] | ListIntFieldRefInput<$PrismaModel>;
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel>;
    lt?: number | IntFieldRefInput<$PrismaModel>;
    lte?: number | IntFieldRefInput<$PrismaModel>;
    gt?: number | IntFieldRefInput<$PrismaModel>;
    gte?: number | IntFieldRefInput<$PrismaModel>;
    not?: NestedIntFilter<$PrismaModel> | number;
  };

  export type NestedDateTimeFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>;
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>;
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>;
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>;
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>;
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>;
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>;
    not?: NestedDateTimeFilter<$PrismaModel> | Date | string;
  };

  export type NestedStringNullableFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null;
    in?: string[] | ListStringFieldRefInput<$PrismaModel> | null;
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel> | null;
    lt?: string | StringFieldRefInput<$PrismaModel>;
    lte?: string | StringFieldRefInput<$PrismaModel>;
    gt?: string | StringFieldRefInput<$PrismaModel>;
    gte?: string | StringFieldRefInput<$PrismaModel>;
    contains?: string | StringFieldRefInput<$PrismaModel>;
    startsWith?: string | StringFieldRefInput<$PrismaModel>;
    endsWith?: string | StringFieldRefInput<$PrismaModel>;
    not?: NestedStringNullableFilter<$PrismaModel> | string | null;
  };

  export type NestedIntWithAggregatesFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel>;
    in?: number[] | ListIntFieldRefInput<$PrismaModel>;
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel>;
    lt?: number | IntFieldRefInput<$PrismaModel>;
    lte?: number | IntFieldRefInput<$PrismaModel>;
    gt?: number | IntFieldRefInput<$PrismaModel>;
    gte?: number | IntFieldRefInput<$PrismaModel>;
    not?: NestedIntWithAggregatesFilter<$PrismaModel> | number;
    _count?: NestedIntFilter<$PrismaModel>;
    _avg?: NestedFloatFilter<$PrismaModel>;
    _sum?: NestedIntFilter<$PrismaModel>;
    _min?: NestedIntFilter<$PrismaModel>;
    _max?: NestedIntFilter<$PrismaModel>;
  };

  export type NestedFloatFilter<$PrismaModel = never> = {
    equals?: number | FloatFieldRefInput<$PrismaModel>;
    in?: number[] | ListFloatFieldRefInput<$PrismaModel>;
    notIn?: number[] | ListFloatFieldRefInput<$PrismaModel>;
    lt?: number | FloatFieldRefInput<$PrismaModel>;
    lte?: number | FloatFieldRefInput<$PrismaModel>;
    gt?: number | FloatFieldRefInput<$PrismaModel>;
    gte?: number | FloatFieldRefInput<$PrismaModel>;
    not?: NestedFloatFilter<$PrismaModel> | number;
  };

  export type NestedDateTimeWithAggregatesFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>;
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>;
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>;
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>;
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>;
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>;
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>;
    not?: NestedDateTimeWithAggregatesFilter<$PrismaModel> | Date | string;
    _count?: NestedIntFilter<$PrismaModel>;
    _min?: NestedDateTimeFilter<$PrismaModel>;
    _max?: NestedDateTimeFilter<$PrismaModel>;
  };

  export type NestedStringNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null;
    in?: string[] | ListStringFieldRefInput<$PrismaModel> | null;
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel> | null;
    lt?: string | StringFieldRefInput<$PrismaModel>;
    lte?: string | StringFieldRefInput<$PrismaModel>;
    gt?: string | StringFieldRefInput<$PrismaModel>;
    gte?: string | StringFieldRefInput<$PrismaModel>;
    contains?: string | StringFieldRefInput<$PrismaModel>;
    startsWith?: string | StringFieldRefInput<$PrismaModel>;
    endsWith?: string | StringFieldRefInput<$PrismaModel>;
    not?:
      | NestedStringNullableWithAggregatesFilter<$PrismaModel>
      | string
      | null;
    _count?: NestedIntNullableFilter<$PrismaModel>;
    _min?: NestedStringNullableFilter<$PrismaModel>;
    _max?: NestedStringNullableFilter<$PrismaModel>;
  };

  export type NestedIntNullableFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel> | null;
    in?: number[] | ListIntFieldRefInput<$PrismaModel> | null;
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel> | null;
    lt?: number | IntFieldRefInput<$PrismaModel>;
    lte?: number | IntFieldRefInput<$PrismaModel>;
    gt?: number | IntFieldRefInput<$PrismaModel>;
    gte?: number | IntFieldRefInput<$PrismaModel>;
    not?: NestedIntNullableFilter<$PrismaModel> | number | null;
  };

  export type NestedBoolNullableFilter<$PrismaModel = never> = {
    equals?: boolean | BooleanFieldRefInput<$PrismaModel> | null;
    not?: NestedBoolNullableFilter<$PrismaModel> | boolean | null;
  };

  export type NestedBytesNullableFilter<$PrismaModel = never> = {
    equals?: Buffer | BytesFieldRefInput<$PrismaModel> | null;
    in?: Buffer[] | ListBytesFieldRefInput<$PrismaModel> | null;
    notIn?: Buffer[] | ListBytesFieldRefInput<$PrismaModel> | null;
    not?: NestedBytesNullableFilter<$PrismaModel> | Buffer | null;
  };

  export type NestedBoolNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: boolean | BooleanFieldRefInput<$PrismaModel> | null;
    not?: NestedBoolNullableWithAggregatesFilter<$PrismaModel> | boolean | null;
    _count?: NestedIntNullableFilter<$PrismaModel>;
    _min?: NestedBoolNullableFilter<$PrismaModel>;
    _max?: NestedBoolNullableFilter<$PrismaModel>;
  };
  export type NestedJsonNullableFilter<$PrismaModel = never> =
    | PatchUndefined<
        Either<
          Required<NestedJsonNullableFilterBase<$PrismaModel>>,
          Exclude<
            keyof Required<NestedJsonNullableFilterBase<$PrismaModel>>,
            "path"
          >
        >,
        Required<NestedJsonNullableFilterBase<$PrismaModel>>
      >
    | OptionalFlat<
        Omit<Required<NestedJsonNullableFilterBase<$PrismaModel>>, "path">
      >;

  export type NestedJsonNullableFilterBase<$PrismaModel = never> = {
    equals?:
      | InputJsonValue
      | JsonFieldRefInput<$PrismaModel>
      | JsonNullValueFilter;
    path?: string[];
    string_contains?: string | StringFieldRefInput<$PrismaModel>;
    string_starts_with?: string | StringFieldRefInput<$PrismaModel>;
    string_ends_with?: string | StringFieldRefInput<$PrismaModel>;
    array_contains?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null;
    array_starts_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null;
    array_ends_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null;
    lt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>;
    lte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>;
    gt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>;
    gte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>;
    not?:
      | InputJsonValue
      | JsonFieldRefInput<$PrismaModel>
      | JsonNullValueFilter;
  };

  export type NestedBytesNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: Buffer | BytesFieldRefInput<$PrismaModel> | null;
    in?: Buffer[] | ListBytesFieldRefInput<$PrismaModel> | null;
    notIn?: Buffer[] | ListBytesFieldRefInput<$PrismaModel> | null;
    not?: NestedBytesNullableWithAggregatesFilter<$PrismaModel> | Buffer | null;
    _count?: NestedIntNullableFilter<$PrismaModel>;
    _min?: NestedBytesNullableFilter<$PrismaModel>;
    _max?: NestedBytesNullableFilter<$PrismaModel>;
  };

  export type DriveDocumentCreateWithoutDriveInput = {
    documentId: string;
  };

  export type DriveDocumentUncheckedCreateWithoutDriveInput = {
    documentId: string;
  };

  export type DriveDocumentCreateOrConnectWithoutDriveInput = {
    where: DriveDocumentWhereUniqueInput;
    create: XOR<
      DriveDocumentCreateWithoutDriveInput,
      DriveDocumentUncheckedCreateWithoutDriveInput
    >;
  };

  export type DriveDocumentCreateManyDriveInputEnvelope = {
    data:
      | DriveDocumentCreateManyDriveInput
      | DriveDocumentCreateManyDriveInput[];
    skipDuplicates?: boolean;
  };

  export type DriveDocumentUpsertWithWhereUniqueWithoutDriveInput = {
    where: DriveDocumentWhereUniqueInput;
    update: XOR<
      DriveDocumentUpdateWithoutDriveInput,
      DriveDocumentUncheckedUpdateWithoutDriveInput
    >;
    create: XOR<
      DriveDocumentCreateWithoutDriveInput,
      DriveDocumentUncheckedCreateWithoutDriveInput
    >;
  };

  export type DriveDocumentUpdateWithWhereUniqueWithoutDriveInput = {
    where: DriveDocumentWhereUniqueInput;
    data: XOR<
      DriveDocumentUpdateWithoutDriveInput,
      DriveDocumentUncheckedUpdateWithoutDriveInput
    >;
  };

  export type DriveDocumentUpdateManyWithWhereWithoutDriveInput = {
    where: DriveDocumentScalarWhereInput;
    data: XOR<
      DriveDocumentUpdateManyMutationInput,
      DriveDocumentUncheckedUpdateManyWithoutDriveInput
    >;
  };

  export type DriveDocumentScalarWhereInput = {
    AND?: DriveDocumentScalarWhereInput | DriveDocumentScalarWhereInput[];
    OR?: DriveDocumentScalarWhereInput[];
    NOT?: DriveDocumentScalarWhereInput | DriveDocumentScalarWhereInput[];
    driveId?: StringFilter<"DriveDocument"> | string;
    documentId?: StringFilter<"DriveDocument"> | string;
  };

  export type OperationCreateWithoutDocumentInput = {
    id?: string;
    opId?: string | null;
    scope: string;
    branch: string;
    index: number;
    skip: number;
    hash: string;
    timestamp: Date | string;
    actionId: string;
    input: string;
    type: string;
    clipboard?: boolean | null;
    context?: NullableJsonNullValueInput | InputJsonValue;
    resultingState?: Buffer | null;
    attachments?: AttachmentCreateNestedManyWithoutOperationInput;
    SynchronizationUnit?: SynchronizationUnitCreateNestedOneWithoutOperationsInput;
  };

  export type OperationUncheckedCreateWithoutDocumentInput = {
    id?: string;
    opId?: string | null;
    scope: string;
    branch: string;
    index: number;
    skip: number;
    hash: string;
    timestamp: Date | string;
    actionId: string;
    input: string;
    type: string;
    syncId?: string | null;
    clipboard?: boolean | null;
    context?: NullableJsonNullValueInput | InputJsonValue;
    resultingState?: Buffer | null;
    attachments?: AttachmentUncheckedCreateNestedManyWithoutOperationInput;
  };

  export type OperationCreateOrConnectWithoutDocumentInput = {
    where: OperationWhereUniqueInput;
    create: XOR<
      OperationCreateWithoutDocumentInput,
      OperationUncheckedCreateWithoutDocumentInput
    >;
  };

  export type OperationCreateManyDocumentInputEnvelope = {
    data: OperationCreateManyDocumentInput | OperationCreateManyDocumentInput[];
    skipDuplicates?: boolean;
  };

  export type SynchronizationUnitCreateWithoutDocumentInput = {
    id: string;
    scope: string;
    branch: string;
    operations?: OperationCreateNestedManyWithoutSynchronizationUnitInput;
  };

  export type SynchronizationUnitUncheckedCreateWithoutDocumentInput = {
    id: string;
    scope: string;
    branch: string;
    operations?: OperationUncheckedCreateNestedManyWithoutSynchronizationUnitInput;
  };

  export type SynchronizationUnitCreateOrConnectWithoutDocumentInput = {
    where: SynchronizationUnitWhereUniqueInput;
    create: XOR<
      SynchronizationUnitCreateWithoutDocumentInput,
      SynchronizationUnitUncheckedCreateWithoutDocumentInput
    >;
  };

  export type SynchronizationUnitCreateManyDocumentInputEnvelope = {
    data:
      | SynchronizationUnitCreateManyDocumentInput
      | SynchronizationUnitCreateManyDocumentInput[];
    skipDuplicates?: boolean;
  };

  export type OperationUpsertWithWhereUniqueWithoutDocumentInput = {
    where: OperationWhereUniqueInput;
    update: XOR<
      OperationUpdateWithoutDocumentInput,
      OperationUncheckedUpdateWithoutDocumentInput
    >;
    create: XOR<
      OperationCreateWithoutDocumentInput,
      OperationUncheckedCreateWithoutDocumentInput
    >;
  };

  export type OperationUpdateWithWhereUniqueWithoutDocumentInput = {
    where: OperationWhereUniqueInput;
    data: XOR<
      OperationUpdateWithoutDocumentInput,
      OperationUncheckedUpdateWithoutDocumentInput
    >;
  };

  export type OperationUpdateManyWithWhereWithoutDocumentInput = {
    where: OperationScalarWhereInput;
    data: XOR<
      OperationUpdateManyMutationInput,
      OperationUncheckedUpdateManyWithoutDocumentInput
    >;
  };

  export type OperationScalarWhereInput = {
    AND?: OperationScalarWhereInput | OperationScalarWhereInput[];
    OR?: OperationScalarWhereInput[];
    NOT?: OperationScalarWhereInput | OperationScalarWhereInput[];
    id?: StringFilter<"Operation"> | string;
    opId?: StringNullableFilter<"Operation"> | string | null;
    documentId?: StringFilter<"Operation"> | string;
    scope?: StringFilter<"Operation"> | string;
    branch?: StringFilter<"Operation"> | string;
    index?: IntFilter<"Operation"> | number;
    skip?: IntFilter<"Operation"> | number;
    hash?: StringFilter<"Operation"> | string;
    timestamp?: DateTimeFilter<"Operation"> | Date | string;
    actionId?: StringFilter<"Operation"> | string;
    input?: StringFilter<"Operation"> | string;
    type?: StringFilter<"Operation"> | string;
    syncId?: StringNullableFilter<"Operation"> | string | null;
    clipboard?: BoolNullableFilter<"Operation"> | boolean | null;
    context?: JsonNullableFilter<"Operation">;
    resultingState?: BytesNullableFilter<"Operation"> | Buffer | null;
  };

  export type SynchronizationUnitUpsertWithWhereUniqueWithoutDocumentInput = {
    where: SynchronizationUnitWhereUniqueInput;
    update: XOR<
      SynchronizationUnitUpdateWithoutDocumentInput,
      SynchronizationUnitUncheckedUpdateWithoutDocumentInput
    >;
    create: XOR<
      SynchronizationUnitCreateWithoutDocumentInput,
      SynchronizationUnitUncheckedCreateWithoutDocumentInput
    >;
  };

  export type SynchronizationUnitUpdateWithWhereUniqueWithoutDocumentInput = {
    where: SynchronizationUnitWhereUniqueInput;
    data: XOR<
      SynchronizationUnitUpdateWithoutDocumentInput,
      SynchronizationUnitUncheckedUpdateWithoutDocumentInput
    >;
  };

  export type SynchronizationUnitUpdateManyWithWhereWithoutDocumentInput = {
    where: SynchronizationUnitScalarWhereInput;
    data: XOR<
      SynchronizationUnitUpdateManyMutationInput,
      SynchronizationUnitUncheckedUpdateManyWithoutDocumentInput
    >;
  };

  export type SynchronizationUnitScalarWhereInput = {
    AND?:
      | SynchronizationUnitScalarWhereInput
      | SynchronizationUnitScalarWhereInput[];
    OR?: SynchronizationUnitScalarWhereInput[];
    NOT?:
      | SynchronizationUnitScalarWhereInput
      | SynchronizationUnitScalarWhereInput[];
    id?: StringFilter<"SynchronizationUnit"> | string;
    documentId?: StringFilter<"SynchronizationUnit"> | string;
    scope?: StringFilter<"SynchronizationUnit"> | string;
    branch?: StringFilter<"SynchronizationUnit"> | string;
  };

  export type DriveCreateWithoutDriveDocumentsInput = {
    id: string;
  };

  export type DriveUncheckedCreateWithoutDriveDocumentsInput = {
    id: string;
  };

  export type DriveCreateOrConnectWithoutDriveDocumentsInput = {
    where: DriveWhereUniqueInput;
    create: XOR<
      DriveCreateWithoutDriveDocumentsInput,
      DriveUncheckedCreateWithoutDriveDocumentsInput
    >;
  };

  export type DriveUpsertWithoutDriveDocumentsInput = {
    update: XOR<
      DriveUpdateWithoutDriveDocumentsInput,
      DriveUncheckedUpdateWithoutDriveDocumentsInput
    >;
    create: XOR<
      DriveCreateWithoutDriveDocumentsInput,
      DriveUncheckedCreateWithoutDriveDocumentsInput
    >;
    where?: DriveWhereInput;
  };

  export type DriveUpdateToOneWithWhereWithoutDriveDocumentsInput = {
    where?: DriveWhereInput;
    data: XOR<
      DriveUpdateWithoutDriveDocumentsInput,
      DriveUncheckedUpdateWithoutDriveDocumentsInput
    >;
  };

  export type DriveUpdateWithoutDriveDocumentsInput = {
    id?: StringFieldUpdateOperationsInput | string;
  };

  export type DriveUncheckedUpdateWithoutDriveDocumentsInput = {
    id?: StringFieldUpdateOperationsInput | string;
  };

  export type DocumentCreateWithoutOperationsInput = {
    id: string;
    ordinal?: number;
    created?: Date | string;
    lastModified?: Date | string;
    slug?: string | null;
    revision: string;
    name?: string | null;
    initialState: string;
    documentType: string;
    meta?: string | null;
    scopes?: DocumentCreatescopesInput | string[];
    synchronizationUnits?: SynchronizationUnitCreateNestedManyWithoutDocumentInput;
  };

  export type DocumentUncheckedCreateWithoutOperationsInput = {
    id: string;
    ordinal?: number;
    created?: Date | string;
    lastModified?: Date | string;
    slug?: string | null;
    revision: string;
    name?: string | null;
    initialState: string;
    documentType: string;
    meta?: string | null;
    scopes?: DocumentCreatescopesInput | string[];
    synchronizationUnits?: SynchronizationUnitUncheckedCreateNestedManyWithoutDocumentInput;
  };

  export type DocumentCreateOrConnectWithoutOperationsInput = {
    where: DocumentWhereUniqueInput;
    create: XOR<
      DocumentCreateWithoutOperationsInput,
      DocumentUncheckedCreateWithoutOperationsInput
    >;
  };

  export type AttachmentCreateWithoutOperationInput = {
    id?: string;
    mimeType: string;
    data: string;
    filename?: string | null;
    extension?: string | null;
    hash: string;
  };

  export type AttachmentUncheckedCreateWithoutOperationInput = {
    id?: string;
    mimeType: string;
    data: string;
    filename?: string | null;
    extension?: string | null;
    hash: string;
  };

  export type AttachmentCreateOrConnectWithoutOperationInput = {
    where: AttachmentWhereUniqueInput;
    create: XOR<
      AttachmentCreateWithoutOperationInput,
      AttachmentUncheckedCreateWithoutOperationInput
    >;
  };

  export type AttachmentCreateManyOperationInputEnvelope = {
    data:
      | AttachmentCreateManyOperationInput
      | AttachmentCreateManyOperationInput[];
    skipDuplicates?: boolean;
  };

  export type SynchronizationUnitCreateWithoutOperationsInput = {
    id: string;
    scope: string;
    branch: string;
    Document: DocumentCreateNestedOneWithoutSynchronizationUnitsInput;
  };

  export type SynchronizationUnitUncheckedCreateWithoutOperationsInput = {
    id: string;
    documentId: string;
    scope: string;
    branch: string;
  };

  export type SynchronizationUnitCreateOrConnectWithoutOperationsInput = {
    where: SynchronizationUnitWhereUniqueInput;
    create: XOR<
      SynchronizationUnitCreateWithoutOperationsInput,
      SynchronizationUnitUncheckedCreateWithoutOperationsInput
    >;
  };

  export type DocumentUpsertWithoutOperationsInput = {
    update: XOR<
      DocumentUpdateWithoutOperationsInput,
      DocumentUncheckedUpdateWithoutOperationsInput
    >;
    create: XOR<
      DocumentCreateWithoutOperationsInput,
      DocumentUncheckedCreateWithoutOperationsInput
    >;
    where?: DocumentWhereInput;
  };

  export type DocumentUpdateToOneWithWhereWithoutOperationsInput = {
    where?: DocumentWhereInput;
    data: XOR<
      DocumentUpdateWithoutOperationsInput,
      DocumentUncheckedUpdateWithoutOperationsInput
    >;
  };

  export type DocumentUpdateWithoutOperationsInput = {
    id?: StringFieldUpdateOperationsInput | string;
    created?: DateTimeFieldUpdateOperationsInput | Date | string;
    lastModified?: DateTimeFieldUpdateOperationsInput | Date | string;
    slug?: NullableStringFieldUpdateOperationsInput | string | null;
    revision?: StringFieldUpdateOperationsInput | string;
    name?: NullableStringFieldUpdateOperationsInput | string | null;
    initialState?: StringFieldUpdateOperationsInput | string;
    documentType?: StringFieldUpdateOperationsInput | string;
    meta?: NullableStringFieldUpdateOperationsInput | string | null;
    scopes?: DocumentUpdatescopesInput | string[];
    synchronizationUnits?: SynchronizationUnitUpdateManyWithoutDocumentNestedInput;
  };

  export type DocumentUncheckedUpdateWithoutOperationsInput = {
    id?: StringFieldUpdateOperationsInput | string;
    ordinal?: IntFieldUpdateOperationsInput | number;
    created?: DateTimeFieldUpdateOperationsInput | Date | string;
    lastModified?: DateTimeFieldUpdateOperationsInput | Date | string;
    slug?: NullableStringFieldUpdateOperationsInput | string | null;
    revision?: StringFieldUpdateOperationsInput | string;
    name?: NullableStringFieldUpdateOperationsInput | string | null;
    initialState?: StringFieldUpdateOperationsInput | string;
    documentType?: StringFieldUpdateOperationsInput | string;
    meta?: NullableStringFieldUpdateOperationsInput | string | null;
    scopes?: DocumentUpdatescopesInput | string[];
    synchronizationUnits?: SynchronizationUnitUncheckedUpdateManyWithoutDocumentNestedInput;
  };

  export type AttachmentUpsertWithWhereUniqueWithoutOperationInput = {
    where: AttachmentWhereUniqueInput;
    update: XOR<
      AttachmentUpdateWithoutOperationInput,
      AttachmentUncheckedUpdateWithoutOperationInput
    >;
    create: XOR<
      AttachmentCreateWithoutOperationInput,
      AttachmentUncheckedCreateWithoutOperationInput
    >;
  };

  export type AttachmentUpdateWithWhereUniqueWithoutOperationInput = {
    where: AttachmentWhereUniqueInput;
    data: XOR<
      AttachmentUpdateWithoutOperationInput,
      AttachmentUncheckedUpdateWithoutOperationInput
    >;
  };

  export type AttachmentUpdateManyWithWhereWithoutOperationInput = {
    where: AttachmentScalarWhereInput;
    data: XOR<
      AttachmentUpdateManyMutationInput,
      AttachmentUncheckedUpdateManyWithoutOperationInput
    >;
  };

  export type AttachmentScalarWhereInput = {
    AND?: AttachmentScalarWhereInput | AttachmentScalarWhereInput[];
    OR?: AttachmentScalarWhereInput[];
    NOT?: AttachmentScalarWhereInput | AttachmentScalarWhereInput[];
    id?: StringFilter<"Attachment"> | string;
    operationId?: StringFilter<"Attachment"> | string;
    mimeType?: StringFilter<"Attachment"> | string;
    data?: StringFilter<"Attachment"> | string;
    filename?: StringNullableFilter<"Attachment"> | string | null;
    extension?: StringNullableFilter<"Attachment"> | string | null;
    hash?: StringFilter<"Attachment"> | string;
  };

  export type SynchronizationUnitUpsertWithoutOperationsInput = {
    update: XOR<
      SynchronizationUnitUpdateWithoutOperationsInput,
      SynchronizationUnitUncheckedUpdateWithoutOperationsInput
    >;
    create: XOR<
      SynchronizationUnitCreateWithoutOperationsInput,
      SynchronizationUnitUncheckedCreateWithoutOperationsInput
    >;
    where?: SynchronizationUnitWhereInput;
  };

  export type SynchronizationUnitUpdateToOneWithWhereWithoutOperationsInput = {
    where?: SynchronizationUnitWhereInput;
    data: XOR<
      SynchronizationUnitUpdateWithoutOperationsInput,
      SynchronizationUnitUncheckedUpdateWithoutOperationsInput
    >;
  };

  export type SynchronizationUnitUpdateWithoutOperationsInput = {
    id?: StringFieldUpdateOperationsInput | string;
    scope?: StringFieldUpdateOperationsInput | string;
    branch?: StringFieldUpdateOperationsInput | string;
    Document?: DocumentUpdateOneRequiredWithoutSynchronizationUnitsNestedInput;
  };

  export type SynchronizationUnitUncheckedUpdateWithoutOperationsInput = {
    id?: StringFieldUpdateOperationsInput | string;
    documentId?: StringFieldUpdateOperationsInput | string;
    scope?: StringFieldUpdateOperationsInput | string;
    branch?: StringFieldUpdateOperationsInput | string;
  };

  export type DocumentCreateWithoutSynchronizationUnitsInput = {
    id: string;
    ordinal?: number;
    created?: Date | string;
    lastModified?: Date | string;
    slug?: string | null;
    revision: string;
    name?: string | null;
    initialState: string;
    documentType: string;
    meta?: string | null;
    scopes?: DocumentCreatescopesInput | string[];
    operations?: OperationCreateNestedManyWithoutDocumentInput;
  };

  export type DocumentUncheckedCreateWithoutSynchronizationUnitsInput = {
    id: string;
    ordinal?: number;
    created?: Date | string;
    lastModified?: Date | string;
    slug?: string | null;
    revision: string;
    name?: string | null;
    initialState: string;
    documentType: string;
    meta?: string | null;
    scopes?: DocumentCreatescopesInput | string[];
    operations?: OperationUncheckedCreateNestedManyWithoutDocumentInput;
  };

  export type DocumentCreateOrConnectWithoutSynchronizationUnitsInput = {
    where: DocumentWhereUniqueInput;
    create: XOR<
      DocumentCreateWithoutSynchronizationUnitsInput,
      DocumentUncheckedCreateWithoutSynchronizationUnitsInput
    >;
  };

  export type OperationCreateWithoutSynchronizationUnitInput = {
    id?: string;
    opId?: string | null;
    scope: string;
    branch: string;
    index: number;
    skip: number;
    hash: string;
    timestamp: Date | string;
    actionId: string;
    input: string;
    type: string;
    clipboard?: boolean | null;
    context?: NullableJsonNullValueInput | InputJsonValue;
    resultingState?: Buffer | null;
    Document?: DocumentCreateNestedOneWithoutOperationsInput;
    attachments?: AttachmentCreateNestedManyWithoutOperationInput;
  };

  export type OperationUncheckedCreateWithoutSynchronizationUnitInput = {
    id?: string;
    opId?: string | null;
    documentId: string;
    scope: string;
    branch: string;
    index: number;
    skip: number;
    hash: string;
    timestamp: Date | string;
    actionId: string;
    input: string;
    type: string;
    clipboard?: boolean | null;
    context?: NullableJsonNullValueInput | InputJsonValue;
    resultingState?: Buffer | null;
    attachments?: AttachmentUncheckedCreateNestedManyWithoutOperationInput;
  };

  export type OperationCreateOrConnectWithoutSynchronizationUnitInput = {
    where: OperationWhereUniqueInput;
    create: XOR<
      OperationCreateWithoutSynchronizationUnitInput,
      OperationUncheckedCreateWithoutSynchronizationUnitInput
    >;
  };

  export type OperationCreateManySynchronizationUnitInputEnvelope = {
    data:
      | OperationCreateManySynchronizationUnitInput
      | OperationCreateManySynchronizationUnitInput[];
    skipDuplicates?: boolean;
  };

  export type DocumentUpsertWithoutSynchronizationUnitsInput = {
    update: XOR<
      DocumentUpdateWithoutSynchronizationUnitsInput,
      DocumentUncheckedUpdateWithoutSynchronizationUnitsInput
    >;
    create: XOR<
      DocumentCreateWithoutSynchronizationUnitsInput,
      DocumentUncheckedCreateWithoutSynchronizationUnitsInput
    >;
    where?: DocumentWhereInput;
  };

  export type DocumentUpdateToOneWithWhereWithoutSynchronizationUnitsInput = {
    where?: DocumentWhereInput;
    data: XOR<
      DocumentUpdateWithoutSynchronizationUnitsInput,
      DocumentUncheckedUpdateWithoutSynchronizationUnitsInput
    >;
  };

  export type DocumentUpdateWithoutSynchronizationUnitsInput = {
    id?: StringFieldUpdateOperationsInput | string;
    created?: DateTimeFieldUpdateOperationsInput | Date | string;
    lastModified?: DateTimeFieldUpdateOperationsInput | Date | string;
    slug?: NullableStringFieldUpdateOperationsInput | string | null;
    revision?: StringFieldUpdateOperationsInput | string;
    name?: NullableStringFieldUpdateOperationsInput | string | null;
    initialState?: StringFieldUpdateOperationsInput | string;
    documentType?: StringFieldUpdateOperationsInput | string;
    meta?: NullableStringFieldUpdateOperationsInput | string | null;
    scopes?: DocumentUpdatescopesInput | string[];
    operations?: OperationUpdateManyWithoutDocumentNestedInput;
  };

  export type DocumentUncheckedUpdateWithoutSynchronizationUnitsInput = {
    id?: StringFieldUpdateOperationsInput | string;
    ordinal?: IntFieldUpdateOperationsInput | number;
    created?: DateTimeFieldUpdateOperationsInput | Date | string;
    lastModified?: DateTimeFieldUpdateOperationsInput | Date | string;
    slug?: NullableStringFieldUpdateOperationsInput | string | null;
    revision?: StringFieldUpdateOperationsInput | string;
    name?: NullableStringFieldUpdateOperationsInput | string | null;
    initialState?: StringFieldUpdateOperationsInput | string;
    documentType?: StringFieldUpdateOperationsInput | string;
    meta?: NullableStringFieldUpdateOperationsInput | string | null;
    scopes?: DocumentUpdatescopesInput | string[];
    operations?: OperationUncheckedUpdateManyWithoutDocumentNestedInput;
  };

  export type OperationUpsertWithWhereUniqueWithoutSynchronizationUnitInput = {
    where: OperationWhereUniqueInput;
    update: XOR<
      OperationUpdateWithoutSynchronizationUnitInput,
      OperationUncheckedUpdateWithoutSynchronizationUnitInput
    >;
    create: XOR<
      OperationCreateWithoutSynchronizationUnitInput,
      OperationUncheckedCreateWithoutSynchronizationUnitInput
    >;
  };

  export type OperationUpdateWithWhereUniqueWithoutSynchronizationUnitInput = {
    where: OperationWhereUniqueInput;
    data: XOR<
      OperationUpdateWithoutSynchronizationUnitInput,
      OperationUncheckedUpdateWithoutSynchronizationUnitInput
    >;
  };

  export type OperationUpdateManyWithWhereWithoutSynchronizationUnitInput = {
    where: OperationScalarWhereInput;
    data: XOR<
      OperationUpdateManyMutationInput,
      OperationUncheckedUpdateManyWithoutSynchronizationUnitInput
    >;
  };

  export type OperationCreateWithoutAttachmentsInput = {
    id?: string;
    opId?: string | null;
    scope: string;
    branch: string;
    index: number;
    skip: number;
    hash: string;
    timestamp: Date | string;
    actionId: string;
    input: string;
    type: string;
    clipboard?: boolean | null;
    context?: NullableJsonNullValueInput | InputJsonValue;
    resultingState?: Buffer | null;
    Document?: DocumentCreateNestedOneWithoutOperationsInput;
    SynchronizationUnit?: SynchronizationUnitCreateNestedOneWithoutOperationsInput;
  };

  export type OperationUncheckedCreateWithoutAttachmentsInput = {
    id?: string;
    opId?: string | null;
    documentId: string;
    scope: string;
    branch: string;
    index: number;
    skip: number;
    hash: string;
    timestamp: Date | string;
    actionId: string;
    input: string;
    type: string;
    syncId?: string | null;
    clipboard?: boolean | null;
    context?: NullableJsonNullValueInput | InputJsonValue;
    resultingState?: Buffer | null;
  };

  export type OperationCreateOrConnectWithoutAttachmentsInput = {
    where: OperationWhereUniqueInput;
    create: XOR<
      OperationCreateWithoutAttachmentsInput,
      OperationUncheckedCreateWithoutAttachmentsInput
    >;
  };

  export type OperationUpsertWithoutAttachmentsInput = {
    update: XOR<
      OperationUpdateWithoutAttachmentsInput,
      OperationUncheckedUpdateWithoutAttachmentsInput
    >;
    create: XOR<
      OperationCreateWithoutAttachmentsInput,
      OperationUncheckedCreateWithoutAttachmentsInput
    >;
    where?: OperationWhereInput;
  };

  export type OperationUpdateToOneWithWhereWithoutAttachmentsInput = {
    where?: OperationWhereInput;
    data: XOR<
      OperationUpdateWithoutAttachmentsInput,
      OperationUncheckedUpdateWithoutAttachmentsInput
    >;
  };

  export type OperationUpdateWithoutAttachmentsInput = {
    id?: StringFieldUpdateOperationsInput | string;
    opId?: NullableStringFieldUpdateOperationsInput | string | null;
    scope?: StringFieldUpdateOperationsInput | string;
    branch?: StringFieldUpdateOperationsInput | string;
    index?: IntFieldUpdateOperationsInput | number;
    skip?: IntFieldUpdateOperationsInput | number;
    hash?: StringFieldUpdateOperationsInput | string;
    timestamp?: DateTimeFieldUpdateOperationsInput | Date | string;
    actionId?: StringFieldUpdateOperationsInput | string;
    input?: StringFieldUpdateOperationsInput | string;
    type?: StringFieldUpdateOperationsInput | string;
    clipboard?: NullableBoolFieldUpdateOperationsInput | boolean | null;
    context?: NullableJsonNullValueInput | InputJsonValue;
    resultingState?: NullableBytesFieldUpdateOperationsInput | Buffer | null;
    Document?: DocumentUpdateOneWithoutOperationsNestedInput;
    SynchronizationUnit?: SynchronizationUnitUpdateOneWithoutOperationsNestedInput;
  };

  export type OperationUncheckedUpdateWithoutAttachmentsInput = {
    id?: StringFieldUpdateOperationsInput | string;
    opId?: NullableStringFieldUpdateOperationsInput | string | null;
    documentId?: StringFieldUpdateOperationsInput | string;
    scope?: StringFieldUpdateOperationsInput | string;
    branch?: StringFieldUpdateOperationsInput | string;
    index?: IntFieldUpdateOperationsInput | number;
    skip?: IntFieldUpdateOperationsInput | number;
    hash?: StringFieldUpdateOperationsInput | string;
    timestamp?: DateTimeFieldUpdateOperationsInput | Date | string;
    actionId?: StringFieldUpdateOperationsInput | string;
    input?: StringFieldUpdateOperationsInput | string;
    type?: StringFieldUpdateOperationsInput | string;
    syncId?: NullableStringFieldUpdateOperationsInput | string | null;
    clipboard?: NullableBoolFieldUpdateOperationsInput | boolean | null;
    context?: NullableJsonNullValueInput | InputJsonValue;
    resultingState?: NullableBytesFieldUpdateOperationsInput | Buffer | null;
  };

  export type DriveDocumentCreateManyDriveInput = {
    documentId: string;
  };

  export type DriveDocumentUpdateWithoutDriveInput = {
    documentId?: StringFieldUpdateOperationsInput | string;
  };

  export type DriveDocumentUncheckedUpdateWithoutDriveInput = {
    documentId?: StringFieldUpdateOperationsInput | string;
  };

  export type DriveDocumentUncheckedUpdateManyWithoutDriveInput = {
    documentId?: StringFieldUpdateOperationsInput | string;
  };

  export type OperationCreateManyDocumentInput = {
    id?: string;
    opId?: string | null;
    scope: string;
    branch: string;
    index: number;
    skip: number;
    hash: string;
    timestamp: Date | string;
    actionId: string;
    input: string;
    type: string;
    syncId?: string | null;
    clipboard?: boolean | null;
    context?: NullableJsonNullValueInput | InputJsonValue;
    resultingState?: Buffer | null;
  };

  export type SynchronizationUnitCreateManyDocumentInput = {
    id: string;
    scope: string;
    branch: string;
  };

  export type OperationUpdateWithoutDocumentInput = {
    id?: StringFieldUpdateOperationsInput | string;
    opId?: NullableStringFieldUpdateOperationsInput | string | null;
    scope?: StringFieldUpdateOperationsInput | string;
    branch?: StringFieldUpdateOperationsInput | string;
    index?: IntFieldUpdateOperationsInput | number;
    skip?: IntFieldUpdateOperationsInput | number;
    hash?: StringFieldUpdateOperationsInput | string;
    timestamp?: DateTimeFieldUpdateOperationsInput | Date | string;
    actionId?: StringFieldUpdateOperationsInput | string;
    input?: StringFieldUpdateOperationsInput | string;
    type?: StringFieldUpdateOperationsInput | string;
    clipboard?: NullableBoolFieldUpdateOperationsInput | boolean | null;
    context?: NullableJsonNullValueInput | InputJsonValue;
    resultingState?: NullableBytesFieldUpdateOperationsInput | Buffer | null;
    attachments?: AttachmentUpdateManyWithoutOperationNestedInput;
    SynchronizationUnit?: SynchronizationUnitUpdateOneWithoutOperationsNestedInput;
  };

  export type OperationUncheckedUpdateWithoutDocumentInput = {
    id?: StringFieldUpdateOperationsInput | string;
    opId?: NullableStringFieldUpdateOperationsInput | string | null;
    scope?: StringFieldUpdateOperationsInput | string;
    branch?: StringFieldUpdateOperationsInput | string;
    index?: IntFieldUpdateOperationsInput | number;
    skip?: IntFieldUpdateOperationsInput | number;
    hash?: StringFieldUpdateOperationsInput | string;
    timestamp?: DateTimeFieldUpdateOperationsInput | Date | string;
    actionId?: StringFieldUpdateOperationsInput | string;
    input?: StringFieldUpdateOperationsInput | string;
    type?: StringFieldUpdateOperationsInput | string;
    syncId?: NullableStringFieldUpdateOperationsInput | string | null;
    clipboard?: NullableBoolFieldUpdateOperationsInput | boolean | null;
    context?: NullableJsonNullValueInput | InputJsonValue;
    resultingState?: NullableBytesFieldUpdateOperationsInput | Buffer | null;
    attachments?: AttachmentUncheckedUpdateManyWithoutOperationNestedInput;
  };

  export type OperationUncheckedUpdateManyWithoutDocumentInput = {
    id?: StringFieldUpdateOperationsInput | string;
    opId?: NullableStringFieldUpdateOperationsInput | string | null;
    scope?: StringFieldUpdateOperationsInput | string;
    branch?: StringFieldUpdateOperationsInput | string;
    index?: IntFieldUpdateOperationsInput | number;
    skip?: IntFieldUpdateOperationsInput | number;
    hash?: StringFieldUpdateOperationsInput | string;
    timestamp?: DateTimeFieldUpdateOperationsInput | Date | string;
    actionId?: StringFieldUpdateOperationsInput | string;
    input?: StringFieldUpdateOperationsInput | string;
    type?: StringFieldUpdateOperationsInput | string;
    syncId?: NullableStringFieldUpdateOperationsInput | string | null;
    clipboard?: NullableBoolFieldUpdateOperationsInput | boolean | null;
    context?: NullableJsonNullValueInput | InputJsonValue;
    resultingState?: NullableBytesFieldUpdateOperationsInput | Buffer | null;
  };

  export type SynchronizationUnitUpdateWithoutDocumentInput = {
    id?: StringFieldUpdateOperationsInput | string;
    scope?: StringFieldUpdateOperationsInput | string;
    branch?: StringFieldUpdateOperationsInput | string;
    operations?: OperationUpdateManyWithoutSynchronizationUnitNestedInput;
  };

  export type SynchronizationUnitUncheckedUpdateWithoutDocumentInput = {
    id?: StringFieldUpdateOperationsInput | string;
    scope?: StringFieldUpdateOperationsInput | string;
    branch?: StringFieldUpdateOperationsInput | string;
    operations?: OperationUncheckedUpdateManyWithoutSynchronizationUnitNestedInput;
  };

  export type SynchronizationUnitUncheckedUpdateManyWithoutDocumentInput = {
    id?: StringFieldUpdateOperationsInput | string;
    scope?: StringFieldUpdateOperationsInput | string;
    branch?: StringFieldUpdateOperationsInput | string;
  };

  export type AttachmentCreateManyOperationInput = {
    id?: string;
    mimeType: string;
    data: string;
    filename?: string | null;
    extension?: string | null;
    hash: string;
  };

  export type AttachmentUpdateWithoutOperationInput = {
    id?: StringFieldUpdateOperationsInput | string;
    mimeType?: StringFieldUpdateOperationsInput | string;
    data?: StringFieldUpdateOperationsInput | string;
    filename?: NullableStringFieldUpdateOperationsInput | string | null;
    extension?: NullableStringFieldUpdateOperationsInput | string | null;
    hash?: StringFieldUpdateOperationsInput | string;
  };

  export type AttachmentUncheckedUpdateWithoutOperationInput = {
    id?: StringFieldUpdateOperationsInput | string;
    mimeType?: StringFieldUpdateOperationsInput | string;
    data?: StringFieldUpdateOperationsInput | string;
    filename?: NullableStringFieldUpdateOperationsInput | string | null;
    extension?: NullableStringFieldUpdateOperationsInput | string | null;
    hash?: StringFieldUpdateOperationsInput | string;
  };

  export type AttachmentUncheckedUpdateManyWithoutOperationInput = {
    id?: StringFieldUpdateOperationsInput | string;
    mimeType?: StringFieldUpdateOperationsInput | string;
    data?: StringFieldUpdateOperationsInput | string;
    filename?: NullableStringFieldUpdateOperationsInput | string | null;
    extension?: NullableStringFieldUpdateOperationsInput | string | null;
    hash?: StringFieldUpdateOperationsInput | string;
  };

  export type OperationCreateManySynchronizationUnitInput = {
    id?: string;
    opId?: string | null;
    documentId: string;
    scope: string;
    branch: string;
    index: number;
    skip: number;
    hash: string;
    timestamp: Date | string;
    actionId: string;
    input: string;
    type: string;
    clipboard?: boolean | null;
    context?: NullableJsonNullValueInput | InputJsonValue;
    resultingState?: Buffer | null;
  };

  export type OperationUpdateWithoutSynchronizationUnitInput = {
    id?: StringFieldUpdateOperationsInput | string;
    opId?: NullableStringFieldUpdateOperationsInput | string | null;
    scope?: StringFieldUpdateOperationsInput | string;
    branch?: StringFieldUpdateOperationsInput | string;
    index?: IntFieldUpdateOperationsInput | number;
    skip?: IntFieldUpdateOperationsInput | number;
    hash?: StringFieldUpdateOperationsInput | string;
    timestamp?: DateTimeFieldUpdateOperationsInput | Date | string;
    actionId?: StringFieldUpdateOperationsInput | string;
    input?: StringFieldUpdateOperationsInput | string;
    type?: StringFieldUpdateOperationsInput | string;
    clipboard?: NullableBoolFieldUpdateOperationsInput | boolean | null;
    context?: NullableJsonNullValueInput | InputJsonValue;
    resultingState?: NullableBytesFieldUpdateOperationsInput | Buffer | null;
    Document?: DocumentUpdateOneWithoutOperationsNestedInput;
    attachments?: AttachmentUpdateManyWithoutOperationNestedInput;
  };

  export type OperationUncheckedUpdateWithoutSynchronizationUnitInput = {
    id?: StringFieldUpdateOperationsInput | string;
    opId?: NullableStringFieldUpdateOperationsInput | string | null;
    documentId?: StringFieldUpdateOperationsInput | string;
    scope?: StringFieldUpdateOperationsInput | string;
    branch?: StringFieldUpdateOperationsInput | string;
    index?: IntFieldUpdateOperationsInput | number;
    skip?: IntFieldUpdateOperationsInput | number;
    hash?: StringFieldUpdateOperationsInput | string;
    timestamp?: DateTimeFieldUpdateOperationsInput | Date | string;
    actionId?: StringFieldUpdateOperationsInput | string;
    input?: StringFieldUpdateOperationsInput | string;
    type?: StringFieldUpdateOperationsInput | string;
    clipboard?: NullableBoolFieldUpdateOperationsInput | boolean | null;
    context?: NullableJsonNullValueInput | InputJsonValue;
    resultingState?: NullableBytesFieldUpdateOperationsInput | Buffer | null;
    attachments?: AttachmentUncheckedUpdateManyWithoutOperationNestedInput;
  };

  export type OperationUncheckedUpdateManyWithoutSynchronizationUnitInput = {
    id?: StringFieldUpdateOperationsInput | string;
    opId?: NullableStringFieldUpdateOperationsInput | string | null;
    documentId?: StringFieldUpdateOperationsInput | string;
    scope?: StringFieldUpdateOperationsInput | string;
    branch?: StringFieldUpdateOperationsInput | string;
    index?: IntFieldUpdateOperationsInput | number;
    skip?: IntFieldUpdateOperationsInput | number;
    hash?: StringFieldUpdateOperationsInput | string;
    timestamp?: DateTimeFieldUpdateOperationsInput | Date | string;
    actionId?: StringFieldUpdateOperationsInput | string;
    input?: StringFieldUpdateOperationsInput | string;
    type?: StringFieldUpdateOperationsInput | string;
    clipboard?: NullableBoolFieldUpdateOperationsInput | boolean | null;
    context?: NullableJsonNullValueInput | InputJsonValue;
    resultingState?: NullableBytesFieldUpdateOperationsInput | Buffer | null;
  };

  /**
   * Aliases for legacy arg types
   */
  /**
   * @deprecated Use DriveCountOutputTypeDefaultArgs instead
   */
  export type DriveCountOutputTypeArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = DriveCountOutputTypeDefaultArgs<ExtArgs>;
  /**
   * @deprecated Use DocumentCountOutputTypeDefaultArgs instead
   */
  export type DocumentCountOutputTypeArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = DocumentCountOutputTypeDefaultArgs<ExtArgs>;
  /**
   * @deprecated Use OperationCountOutputTypeDefaultArgs instead
   */
  export type OperationCountOutputTypeArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = OperationCountOutputTypeDefaultArgs<ExtArgs>;
  /**
   * @deprecated Use SynchronizationUnitCountOutputTypeDefaultArgs instead
   */
  export type SynchronizationUnitCountOutputTypeArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = SynchronizationUnitCountOutputTypeDefaultArgs<ExtArgs>;
  /**
   * @deprecated Use DriveDefaultArgs instead
   */
  export type DriveArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = DriveDefaultArgs<ExtArgs>;
  /**
   * @deprecated Use DocumentDefaultArgs instead
   */
  export type DocumentArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = DocumentDefaultArgs<ExtArgs>;
  /**
   * @deprecated Use DriveDocumentDefaultArgs instead
   */
  export type DriveDocumentArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = DriveDocumentDefaultArgs<ExtArgs>;
  /**
   * @deprecated Use OperationDefaultArgs instead
   */
  export type OperationArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = OperationDefaultArgs<ExtArgs>;
  /**
   * @deprecated Use SynchronizationUnitDefaultArgs instead
   */
  export type SynchronizationUnitArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = SynchronizationUnitDefaultArgs<ExtArgs>;
  /**
   * @deprecated Use AttachmentDefaultArgs instead
   */
  export type AttachmentArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = AttachmentDefaultArgs<ExtArgs>;

  /**
   * Batch Payload for updateMany & deleteMany & createMany
   */

  export type BatchPayload = {
    count: number;
  };

  /**
   * DMMF
   */
  export const dmmf: runtime.BaseDMMF;
}
